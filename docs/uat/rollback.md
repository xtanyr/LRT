# Обновление и откат LRT

Обновляйте UAT в согласованное окно, когда участники не редактируют отчёты. Перед переключением выпуска сделайте дамп и проверьте его восстановление:

```bash
sudo bash /opt/lrt/current/deploy/ubuntu/backup.sh
sudo bash /opt/lrt/current/deploy/ubuntu/restore-check.sh
```

Распакуйте новый архив в отдельный каталог `/opt/lrt/releases/<release>`, проверьте checksum и manifest. Затем переключите ссылку и перезапустите приложение:

```bash
sudo ln -sfn /opt/lrt/releases/<release> /opt/lrt/current
cd /opt/lrt/current
sudo docker compose -p lrt --env-file /opt/lrt/shared/.env up -d --build
sudo docker compose -p lrt --env-file /opt/lrt/shared/.env ps
curl -fsS https://rating.example.ru/api/health
```

Если новая версия не стартовала до миграции данных, верните ссылку на предыдущий release и выполните `up -d --build` из его каталога. Если миграция успела изменить схему или данные несовместимым образом, верните каталог предыдущего release, остановите API/web, восстановите последний проверенный дамп и затем поднимите сервисы:

```bash
sudo docker compose -p lrt --env-file /opt/lrt/shared/.env stop api web
sudo env RESTORE_LRT_CONFIRM=YES bash /opt/lrt/current/deploy/ubuntu/restore.sh /var/backups/lrt/lrt-<timestamp>.dump
cd /opt/lrt/current
sudo docker compose -p lrt --env-file /opt/lrt/shared/.env up -d
curl -fsS https://rating.example.ru/api/health
```

Восстановление заменяет текущее содержимое тестовой базы состоянием дампа и удалит изменения, появившиеся после его создания. Поэтому перед восстановлением сохраните отдельный дамп текущего состояния, если он может понадобиться для разбора. `restore-check.sh` проверяет dump во временной базе и не меняет рабочую базу.


## Роль «Лидер-семпай»

Релиз добавляет только новое: значение `SENPAI` в enum `UserRole` (миграция `20261118100000_add_senpai_role`) и таблицу `user_supervisions` (миграция `20261118100100_user_supervisions`). Существующие таблицы и данные не меняются.

- Пока ни у одного пользователя нет роли `SENPAI`, предыдущая сборка работает с обновлённой базой без изменений: лишнее значение enum и пустая таблица ей не мешают.
- Если семпаи уже назначены, перед возвратом на предыдущую сборку переведите их в другую роль (раздел «Пользователи» → «Настроить», либо `UPDATE users SET role = 'VIEWER' WHERE role = 'SENPAI';`). Иначе старая сборка не сможет прочитать строки с неизвестной ей ролью. Привязки в `user_supervisions` при этом можно оставить: старая сборка их не использует.
- Значение enum в PostgreSQL не удаляется, а таблица `user_supervisions` не мешает работе, поэтому откат миграций не нужен. Если всё же нужно вернуть схему полностью, используйте восстановление из дампа, сделанного перед релизом (`backup.sh`, см. выше).
- Перед выкладкой обязательно снимите дамп (`backup.sh`) и проверьте его (`restore-check.sh`).
