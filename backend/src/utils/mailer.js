/**
 * mailer.js — Envio de e-mail via SMTP
 * Suporta Gmail (recomendado) ou SMTP interno CTG Brasil
 * Lê configurações de variáveis de ambiente para uso seguro.
 */

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// ─── CONFIG VIA ENV ───────────────────────────────────────────────────
const SMTP_HOST  = process.env.SMTP_HOST || 'dtcvppostfix.ctgpar.ctgbr.com.br';
const SMTP_PORT  = parseInt(process.env.SMTP_PORT || '25', 10);
const SMTP_FROM  = process.env.SMTP_FROM || 'ctg.engenharia@appmail.ctgbr.com.br';
const SMTP_USER  = process.env.SMTP_USER || '';
const SMTP_PASS  = process.env.SMTP_PASS || '';
const USAR_TLS   = process.env.SMTP_TLS === 'true';

// Gmail config (prioritário se configurado)
const GMAIL_USER = process.env.SMTP_GMAIL_USER || '';
const GMAIL_PASS = process.env.SMTP_GMAIL_PASS || '';

// ─── TRANSPORTER ─────────────────────────────────────────────────────
function createTransporter() {
  // GMAIL (prioritário)
  if (GMAIL_USER && GMAIL_PASS) {
    console.log('  📧 Usando Gmail:', GMAIL_USER);
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_PASS, // App Password do Gmail
      },
    });
  }

  // SMTP interno CTG (fallback)
  console.log('  📧 Usando SMTP interno:', SMTP_HOST);
  const config = {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false, // false = tenta STARTTLS
    connectionTimeout: 30000,
    socketTimeout: 30000,
  };

  if (USAR_TLS) {
    config.requireTLS = true;
  }

  if (SMTP_USER && SMTP_PASS) {
    config.auth = {
      user: SMTP_USER,
      pass: SMTP_PASS,
    };
  }

  return nodemailer.createTransport(config);
}

// ─── ENVIAR EMAIL ─────────────────────────────────────────────────────
export async function enviarEmail({ destinatarios, assunto, mensagemHtml, anexoPath, anexoNome }) {
  const transporter = createTransporter();

  const mailOptions = {
    from: GMAIL_USER || SMTP_FROM, // Gmail usa o próprio e-mail como remetente
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
    console.log(`  ✅ E-mail enviado para: ${mailOptions.to} (${info.messageId})`);
    return info;
  } catch (err) {
    console.error('❌ Erro ao enviar e-mail:', err.message);
    throw new Error(`Falha no envio via SMTP: ${err.message}`);
  }
}

export default { enviarEmail };
