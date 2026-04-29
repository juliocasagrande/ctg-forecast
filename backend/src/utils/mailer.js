/**
 * mailer.js — Envio de e-mail via SMTP interno CTG Brasil
 * Lê configurações de variáveis de ambiente para uso seguro.
 * Segue a mesma lógica do mailer.py de referência.
 */

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// ─── CONFIG VIA ENV ───────────────────────────────────────────────────────────
const SMTP_HOST  = process.env.SMTP_HOST || 'dtcvppostfix.ctgpar.ctgbr.com.br';
const SMTP_PORT  = parseInt(process.env.SMTP_PORT || '25', 10);
const REMETENTE  = process.env.SMTP_FROM || 'cronograma_de_paradas@appmail.ctgbr.com.br';
const SMTP_USER  = process.env.SMTP_USER || '';
const SMTP_PASS  = process.env.SMTP_PASS || '';
const USAR_TLS   = process.env.SMTP_TLS === 'true';

// ─── TRANSPORTER ──────────────────────────────────────────────────────────────
function createTransporter() {
  const config = {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: USAR_TLS,
    tls: {
      rejectUnauthorized: false,
    },
  };

  if (SMTP_USER && SMTP_PASS) {
    config.auth = {
      user: SMTP_USER,
      pass: SMTP_PASS,
    };
  }

  return nodemailer.createTransport(config);
}

// ─── ENVIAR EMAIL ─────────────────────────────────────────────────────────────
export async function enviarEmail({ destinatarios, assunto, mensagemHtml, anexoPath, anexoNome }) {
  const transporter = createTransporter();

  const mailOptions = {
    from: REMETENTE,
    to: Array.isArray(destinatarios) ? destinatarios.join(', ') : destinatarios,
    subject: assunto,
    html: mensagemHtml,
  };

  // Anexo opcional
  if (anexoPath) {
    mailOptions.attachments = [
      {
        filename: anexoNome || anexoPath.split('/').pop(),
        path: anexoPath,
      },
    ];
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`  E-mail enviado para: ${mailOptions.to} (${info.messageId})`);
    return info;
  } catch (err) {
    console.error('Erro ao enviar e-mail:', err);
    throw new Error(`Falha no envio via SMTP (${SMTP_HOST}:${SMTP_PORT}): ${err.message}`);
  }
}

export default { enviarEmail };
