# Развёртывание LRT для UAT на Ubuntu

Runbook рассчитан на чистый Ubuntu 24.04 LTS, отдельный домен и тестовые данные. Минимум для теста — 2 vCPU, 4 GB RAM, 30 GB SSD и публичный IPv4. Откройте в firewall провайдера только SSH, HTTP и HTTPS; PostgreSQL и Docker-порт приложения наружу не публикуются.

## 1. Подготовить DNS и release

Создайте A-запись домена на IPv4 сервера. На Windows из корня проекта соберите пакет:

```powershell
# В WSL или Git Bash из корня проекта:
bash deploy/uat/preflight.sh

# Затем в PowerShell из корня проекта:
.\deploy\uat\package-release.ps1
```

Preflight запускается из WSL/Git Bash и прогоняет проверки проекта. Скопируйте сформированный `.zip` и соответствующий `.sha256` на сервер. На сервере распакуйте пакет в новый каталог выпуска, сверив контрольную сумму:

```bash
cd /opt/lrt/releases
sha256sum -c /tmp/lrt-uat-YYYYMMDD-HHMMSS.zip.sha256
sudo mkdir -p /opt/lrt/releases/release-1
sudo unzip /tmp/lrt-uat-YYYYMMDD-HHMMSS.zip -d /opt/lrt/releases/release-1
```

## 2. Установить сервер и TLS

Запустите из распакованного каталога:

```bash
sudo bash deploy/ubuntu/install-host.sh rating.example.ru admin@example.ru
```

Скрипт ставит Docker Engine/Compose, nginx и Certbot, оставляет публичными SSH/80/443, настраивает proxy с лимитом загрузки 25 MB и получает TLS-сертификат. Домен уже должен разрешаться в IP этого сервера.

## 3. Настроить конфигурацию и запустить приложение

```bash
sudo cp .env.example /opt/lrt/shared/.env
sudo nano /opt/lrt/shared/.env
```

Заполните `POSTGRES_PASSWORD` и `JWT_SECRET` уникальными случайными значениями. Удобно сгенерировать безопасные для URL пароли шестнадцатеричные строки:

```bash
openssl rand -hex 32
```

Установите точный `PUBLIC_ORIGIN=https://rating.example.ru`, `HTTP_PORT=8080`, `ALLOW_SELF_REGISTRATION=false`. Оставьте Google и почтовые credentials пустыми, если для них нет отдельных тестовых подключений. `ALLOW_UAT_SEED` оставьте выключенным.

Подключите выпуск и запустите:

```bash
sudo ln -sfn /opt/lrt/releases/release-1 /opt/lrt/current
cd /opt/lrt/current
sudo docker compose -p lrt --env-file /opt/lrt/shared/.env up -d --build
sudo docker compose -p lrt --env-file /opt/lrt/shared/.env ps
curl -fsS https://rating.example.ru/api/health
```

Health endpoint должен вернуть `{"status":"ok","database":"ok"}`, а сервисы `db`, `api`, `web` должны стать `healthy`.

## 4. Создать тестовые аккаунты и историю

Создайте один уникальный пароль длиной не менее 12 символов и передайте его участникам отдельно от ссылки. В каталоге `/opt/lrt/current` выполните, подставив пароль в shell-переменную (не сохраняйте его в истории команд):

```bash
read -rsp 'UAT password: ' UAT_PASSWORD; echo
docker compose -p lrt --env-file /opt/lrt/shared/.env run --rm --no-deps \
  -e ALLOW_UAT_SEED=true -e UAT_PASSWORD="$UAT_PASSWORD" \
  --entrypoint node api prisma/seed.cjs
docker compose -p lrt --env-file /opt/lrt/shared/.env run --rm --no-deps \
  -e ALLOW_UAT_SEED=true -e UAT_PASSWORD="$UAT_PASSWORD" \
  --entrypoint node api prisma/seed-yearly-demo.cjs
docker compose -p lrt --env-file /opt/lrt/shared/.env run --rm --no-deps \
  -e UAT_PASSWORD="$UAT_PASSWORD" --entrypoint node api test/uat-seed-smoke.cjs
unset UAT_PASSWORD
```

`UAT_YEAR` можно передать всем трём командам через `-e UAT_YEAR=2026`. Текущий год используется по умолчанию. Базовый seed создаёт роли admin, COO, city leader и leader; yearly seed создаёт четыре демонстрационных аккаунта лидеров и 48 отправленных отчётов. Заходить следует под лидером города `cityleader@skuratovcoffee.ru`, COO `coo@skuratovcoffee.ru`, администратором `admin@skuratovcoffee.ru` и одним из четырёх адресов, указанных в сценарии UAT. Всем созданным аккаунтам задаётся переданный пароль.

Переменная `ALLOW_UAT_SEED=true` действует только для одноразовых команд `run` и не включается в постоянно работающий API.

## 5. Проверить роли и передать ссылку

```bash
cd /opt/lrt/current
LRT_BASE_URL=https://rating.example.ru UAT_PASSWORD='пароль' node deploy/uat/smoke.cjs
```

Smoke проверяет readiness, вход всех четырёх ролей, чтение собственного профиля и закрытую публичную регистрацию. После него проведите [сценарии стейкхолдеров](stakeholder-test-guide.md) и отправляйте замечания по [шаблону](issue-template.md). Тестируйте только синтетические данные.

### Проверить самостоятельную регистрацию

Форма доступна по `/register` и по ссылке «Зарегистрироваться» на странице входа. По умолчанию API не принимает самостоятельную регистрацию: `ALLOW_SELF_REGISTRATION=false`. Для тестирования регистрации установите `ALLOW_SELF_REGISTRATION=true` в `/opt/lrt/shared/.env`, затем пересоздайте API с этой конфигурацией:

```bash
cd /opt/lrt/current
sudo nano /opt/lrt/shared/.env
sudo docker compose -p lrt --env-file /opt/lrt/shared/.env up -d --no-deps --force-recreate api
```

При развёртывании в `~/lrt` редактируйте файл `.env` в этом каталоге и выполняйте Compose без `--env-file /opt/lrt/shared/.env`.

Новый пользователь вводит имя, email и пароль, получает роль «Лидер кофейни» (`LEADER`) и входит в сервис. До назначения кофейни он видит сообщение об ожидании назначения; чужие отчёты ему недоступны. Администратор открывает настройки пользователей, выбирает нового пользователя, назначает город, кофейню и дату назначения. Роль лидера города, COO или администратора также назначается администратором в настройках пользователя. После назначения пользователь обновляет страницу, чтобы загрузить доступные кофейни. Регистрация не отправляет письмо для подтверждения email.

Для smoke явно передайте ту же настройку, что включена в API:

```bash
read -rsp 'UAT password: ' UAT_PASSWORD; echo
LRT_BASE_URL=https://rating.example.ru ALLOW_SELF_REGISTRATION=true \
  UAT_PASSWORD="$UAT_PASSWORD" node deploy/uat/smoke.cjs
unset UAT_PASSWORD
```

При `ALLOW_SELF_REGISTRATION=true` smoke отправляет запрос регистрации с email существующего UAT-администратора и ожидает `409`: API принимает регистрацию, но предотвращает повторное создание аккаунта. При `false` или отсутствии этой переменной smoke ожидает `403`. Проверка не создаёт дополнительных пользователей. Саму успешную регистрацию нового лидера и назначение кофейни проверьте вручную через `/register`.

## 6. Ежедневные резервные копии и обновление

```bash
sudo install -m 0644 deploy/ubuntu/lrt-backup.service deploy/ubuntu/lrt-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lrt-backup.timer
sudo systemctl start lrt-backup.service
sudo systemctl status lrt-backup.service
```

Backup запускает `pg_dump` в custom-format, хранит 14 дней и проверяет восстановление во временную базу. Сами дампы нужно дополнительно копировать на отдельное защищённое хранилище.

Для каждого обновления распакуйте новый release рядом со старым, проверьте его, создайте backup и переключите `/opt/lrt/current` только после успешного запуска. Полный порядок отката, в том числе восстановление базы, описан в [rollback.md](rollback.md).
