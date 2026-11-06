-- Роль «Просмотр»: просмотр как у COO без права изменять данные.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'VIEWER';
