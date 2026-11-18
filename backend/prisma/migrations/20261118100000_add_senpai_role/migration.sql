-- Роль «Лидер-семпай»: только просмотр кофеен и отчётов подчинённых лидеров.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SENPAI';
