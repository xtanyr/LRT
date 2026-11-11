import { ServiceUnavailableException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PasswordResetDeliveryService } from '../../src/auth/password-reset-delivery.service';

jest.mock('nodemailer');

function service(values: Record<string, string | undefined>) {
  return new PasswordResetDeliveryService({ get: (key: string) => values[key] } as any);
}

describe('PasswordResetDeliveryService (SMTP)', () => {
  const sendMail = jest.fn();
  const close = jest.fn();

  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue({});
    close.mockReset();
    (nodemailer.createTransport as jest.Mock).mockReset().mockReturnValue({ sendMail, close });
  });

  it('is configured only when host and sender are set', () => {
    expect(service({}).isConfigured()).toBe(false);
    expect(service({ SMTP_HOST: 'smtp.example.ru' }).isConfigured()).toBe(false);
    expect(service({ SMTP_FROM: 'LRT <no-reply@example.ru>' }).isConfigured()).toBe(false);
    expect(service({ SMTP_HOST: 'smtp.example.ru', SMTP_FROM: 'LRT <no-reply@example.ru>' }).isConfigured()).toBe(true);
  });

  it('refuses to send when not configured', async () => {
    await expect(service({}).sendPasswordReset({ email: 'a@b.ru', resetUrl: 'https://x/login?resetToken=t' }))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('sends through STARTTLS on port 587 by default with authentication', async () => {
    await service({ SMTP_HOST: 'smtp.example.ru', SMTP_FROM: 'LRT <no-reply@example.ru>', SMTP_USER: 'robot', SMTP_PASSWORD: 'secret' })
      .sendPasswordReset({ email: 'leader@example.ru', resetUrl: 'https://rating.example.ru/login?resetToken=abc' });

    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.example.ru', port: 587, secure: false, requireTLS: true, auth: { user: 'robot', pass: 'secret' },
    }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'LRT <no-reply@example.ru>',
      to: 'leader@example.ru',
      text: expect.stringContaining('https://rating.example.ru/login?resetToken=abc'),
    }));
    expect(close).toHaveBeenCalled();
  });

  it('uses implicit TLS on port 465 and skips auth when no user is set', async () => {
    await service({ SMTP_HOST: 'smtp.example.ru', SMTP_PORT: '465', SMTP_FROM: 'no-reply@example.ru' })
      .sendPasswordReset({ email: 'leader@example.ru', resetUrl: 'https://rating.example.ru/login?resetToken=abc' });

    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      port: 465, secure: true, requireTLS: false, auth: undefined,
    }));
  });

  it('hides SMTP failure details from the caller', async () => {
    sendMail.mockRejectedValue(new Error('535 Authentication failed for robot'));
    const promise = service({ SMTP_HOST: 'smtp.example.ru', SMTP_FROM: 'no-reply@example.ru' })
      .sendPasswordReset({ email: 'leader@example.ru', resetUrl: 'https://x/login?resetToken=t' });

    await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(promise).rejects.toThrow('Could not send password reset email');
    expect(close).toHaveBeenCalled();
  });
});
