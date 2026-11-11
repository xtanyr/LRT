import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface PasswordResetMessage {
  email: string;
  resetUrl: string;
}

/**
 * Отправка писем со ссылкой на сброс пароля через SMTP.
 * Настройки (переменные окружения): SMTP_HOST, SMTP_PORT (по умолчанию 587), SMTP_SECURE
 * (true — TLS с самого начала, обычно порт 465; иначе на порту 587 используется STARTTLS),
 * SMTP_USER и SMTP_PASSWORD (необязательны для relay без авторизации), SMTP_FROM.
 */
@Injectable()
export class PasswordResetDeliveryService {
  private readonly logger = new Logger(PasswordResetDeliveryService.name);

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.configService.get<string>('SMTP_HOST') && this.configService.get<string>('SMTP_FROM'));
  }

  async sendPasswordReset(message: PasswordResetMessage): Promise<void> {
    const host = this.configService.get<string>('SMTP_HOST');
    const from = this.configService.get<string>('SMTP_FROM');
    if (!host || !from) {
      throw new ServiceUnavailableException('Password reset email delivery is not configured');
    }

    const port = Number(this.configService.get<string>('SMTP_PORT')) || 587;
    const secureSetting = this.configService.get<string>('SMTP_SECURE');
    const secure = secureSetting ? secureSetting === 'true' : port === 465;
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASSWORD');

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: !secure,
      auth: user ? { user, pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });

    try {
      await transporter.sendMail({
        from,
        to: message.email,
        subject: 'Сброс пароля',
        text: `Чтобы задать новый пароль, откройте ссылку: ${message.resetUrl}\n\nЕсли вы не запрашивали сброс пароля, просто проигнорируйте это письмо.`,
      });
    } catch (error) {
      this.logger.error(`Не удалось отправить письмо для сброса пароля через SMTP ${host}:${port}: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Could not send password reset email');
    } finally {
      transporter.close();
    }
  }
}
