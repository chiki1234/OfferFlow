export type AccountEmailEnvironment = {
  [key: string]: string | undefined;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM?: string;
};

export type AccountEmailConfiguration = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

type AccountEmailContent = {
  kind: "verification" | "password-reset";
  name: string;
  url: string;
};

export type AccountEmailDelivery = AccountEmailContent & { to: string };
type MailTransport = {
  sendMail(message: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
};
type MailTransportFactory = (options: {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  requireTLS: boolean;
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
}) => MailTransport;

const createSmtpTransport: MailTransportFactory = (options) => nodemailer.createTransport(options);

function required(environment: AccountEmailEnvironment, name: keyof AccountEmailEnvironment) {
  const value = environment[name];
  if (!value?.trim()) throw new Error(`${name} is required for public account email`);
  return name === "SMTP_PASSWORD" ? value : value.trim();
}

export function readAccountEmailConfiguration(
  environment: AccountEmailEnvironment,
): AccountEmailConfiguration {
  const portText = required(environment, "SMTP_PORT");
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535");
  }

  return {
    host: required(environment, "SMTP_HOST"),
    port,
    secure: port === 465,
    user: required(environment, "SMTP_USER"),
    password: required(environment, "SMTP_PASSWORD"),
    from: required(environment, "SMTP_FROM"),
  };
}

export function buildAccountEmail(input: AccountEmailContent) {
  if (input.kind === "verification") {
    return {
      subject: "验证你的 OfferFlow 邮箱",
      text: `${input.name}，你好：\n\n请在一小时内打开下面的链接，完成 OfferFlow 邮箱验证：\n${input.url}\n\n如果不是你发起的注册，可以忽略这封邮件。`,
    };
  }

  return {
    subject: "重设你的 OfferFlow 密码",
    text: `${input.name}，你好：\n\n请打开下面的一次性链接，重设你的 OfferFlow 密码：\n${input.url}\n\n如果不是你发起的操作，可以忽略这封邮件。`,
  };
}

export async function deliverAccountEmail(
  input: AccountEmailDelivery,
  environment: AccountEmailEnvironment = process.env,
  createTransport: MailTransportFactory = createSmtpTransport,
) {
  const configuration = readAccountEmailConfiguration(environment);
  const transport = createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.secure,
    auth: { user: configuration.user, pass: configuration.password },
    requireTLS: !configuration.secure,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  const content = buildAccountEmail(input);
  await transport.sendMail({
    from: configuration.from,
    to: input.to,
    subject: content.subject,
    text: content.text,
  });
}
import nodemailer from "nodemailer";
