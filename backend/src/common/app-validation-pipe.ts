import { ValidationPipe } from '@nestjs/common';
import * as validator from 'class-validator';
import * as transformer from 'class-transformer';

export function createAppValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    validatorPackage: validator,
    transformerPackage: transformer,
  });
}
