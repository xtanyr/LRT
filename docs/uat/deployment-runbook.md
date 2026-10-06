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

### Проверить одинаковые статусы на дашборде города

Yearly seed заранее создаёт отправленные отчёты за **все 12 месяцев**, включая будущие. Поэтому у московских `Coffee Shop 1` и `Coffee Shop 2` дашборд показывает «Заполнено» и «Сданность 2 / 2» для каждого месяца этого года. Это состояние тестовых данных. Изменение значений уже отправленного отчёта сохраняет его статус; автосохранение нового черновика не отправляет отчёт.

Seed также задаёт искусственную дату отправки — 5-е число следующего месяца в 12:00 МСК. Для сентября 2026 это `2026-10-05T09:00:00.000Z`. Эта дата не свидетельствует о реальной отправке участником теста.

Чтобы проверить фактические записи на сервере, выполните в `/opt/lrt/current` команду ниже. Она только читает статусы и даты двух демонстрационных кофеен; при необходимости замените `year` и `month`.

```bash
docker compose -p lrt --env-file /opt/lrt/shared/.env exec -T api node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const shops = await prisma.coffeeShop.findMany({
    where: { name: { in: ['Coffee Shop 1', 'Coffee Shop 2'] }, city: { name: 'Москва' } },
    select: {
      name: true,
      reports: {
        where: { year: 2026, month: 9 },
        select: { year: true, month: true, status: true, submittedAt: true },
      },
    },
    orderBy: { name: 'asc' },
  });
  console.log(JSON.stringify(shops, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
NODE
```

Если записи имеют `SUBMITTED`, одинаковое «Заполнено» соответствует данным. Если запись отсутствует либо имеет `NOT_FILLED` / `OVERDUE`, а интерфейс показывает «Заполнено», сохраните результат команды вместе с выбранным периодом для разбора. Проверку черновиков и отсутствующих отчётов проводите на новой тестовой кофейне либо в году без заранее созданной истории. Повторный yearly seed перезаписывает отчёты и правки участников, поэтому для такой проверки его повторно не запускайте.

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

### Открыть старые месяцы для тестирования триггеров

В `.env` тестового сервера установите `ALLOW_HISTORICAL_REPORT_EDITING=true`. После обновления исходников пересоберите API и интерфейс:

```bash
cd ~/lrt
sudo docker compose -p lrt up -d --build --no-deps api web
```

Для схемы `/opt/lrt/current` используйте существующий `--env-file /opt/lrt/shared/.env`. Откройте форму отчёта и выберите старый период. Метка «Исторический · тестовое редактирование» подтверждает разрешение. Доступ распространяется на числовые поля, анализ и отправку отчёта, включая создание отчёта за отсутствующий старый месяц. Ограничения по кофейне и городу продолжают действовать.

Включение режима не снимает сохранённые блокировки и не пересчитывает историю при просмотре. При сохранении изменённого отчёта его рейтинг, зоны и баллы пересчитываются, изменения записываются в аудит. При сохранении и автосохранении уже отправленный отчёт сохраняет статус и дату последней отправки. Повторное нажатие «Отправить отчёт» записывает фактическое время новой отправки; прежняя и новая даты, а также пользователь, повторно отправивший отчёт, сохраняются в аудите. Первоначальная привязка отчёта к лидеру для годового рейтинга сохраняется.

Импортированные отчёты с политикой `preserve-source-score` остаются доступными только для чтения и в тестовом режиме: исходный рейтинг нельзя заменять пересчётом. Для испытаний триггеров создавайте отдельные синтетические отчёты.

Монитор триггеров проверяет данные каждые 15 минут, заканчивая окно предыдущим календарным месяцем по Москве. Кнопка «Проверить сейчас» на странице «Триггеры ИПВ» запускает ту же проверку сразу для доступных пользователю кофеен. Вкладка «Мониторинг кофеен» показывает проверяемое окно и причины отсутствия события: недостающие отправленные отчёты/рейтинги, недостаточный стаж, пустую дату утверждения, ручное исключение или отключённое правило. Число последовательных месяцев берётся из настройки `monthsCount` каждого правила: по умолчанию T1/T3 используют 3 месяца, T2 — 12. При тесте T1/T3 в октябре 2026 это июль, август и сентябрь; для T2 нужны отчёты с октября 2025 по сентябрь 2026. Для ускоренного теста T2 можно временно уменьшить `monthsCount` в настройках триггеров, затем вернуть 12. Все отчёты окна должны быть отправлены. Также проверьте минимальный стаж назначения/утверждения лидера и отсутствие активного исключения. Завершённые и будущие назначения лидера не блокируют текущего подходящего лидера. Одновременные причины одной кофейни открываются и завершаются как один ИПВ; уведомления получает только действующий лидер города. Уже открытое ИПВ и повторное срабатывание того же правила за тот же период не создают дубликат.

После теста установите `ALLOW_HISTORICAL_REPORT_EDITING=false`, пересоздайте API и обновите страницу:

```bash
sudo docker compose -p lrt up -d --no-deps --force-recreate api
```

Обычная блокировка старых месяцев восстановится. По умолчанию флаг выключен.

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
