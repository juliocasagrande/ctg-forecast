/**
 * test-email.js — Teste rápido de envio de e-mail
 * Execute: node test-email.js
 */
import 'dotenv/config.js';
import { enviarEmail } from './src/utils/mailer.js';

// Se Gmail configurado, usa o e-mail do Gmail como destinatário
const destinatario = process.env.SMTP_GMAIL_USER || process.env.SMTP_USER || 'julio.casagrande@ctgbr.com.br';

console.log('📧 Testando envio de e-mail...');
if (process.env.SMTP_GMAIL_USER) {
  console.log('   Provedor: Gmail');
  console.log('   Conta:', process.env.SMTP_GMAIL_USER);
} else {
  console.log('   SMTP_HOST:', process.env.SMTP_HOST || '(padrão)');
  console.log('   SMTP_PORT:', process.env.SMTP_PORT || '25');
  console.log('   SMTP_USER:', process.env.SMTP_USER ? '(configurado)' : '(vazio)');
}
console.log('   Destinatário:', destinatario);
console.log('');

enviarEmail({
  destinatarios: [destinatario],
  assunto: 'CTG.Engenharia — Teste de E-mail',
  mensagemHtml: `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #001F5B;">Teste de Envio</h2>
      <p>Este é um e-mail de teste do sistema CTG.Engenharia.</p>
      <p>Se você recebeu este e-mail, a configuração SMTP está funcionando corretamente! ✅</p>
      <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;" />
      <p style="font-size: 0.85rem; color: #999;">CTG Brasil — Engenharia</p>
    </div>
  `,
}).then(() => {
  console.log('✅ E-mail enviado com sucesso!');
  process.exit(0);
}).catch((err) => {
  console.error('❌ Erro ao enviar e-mail:', err.message);
  process.exit(1);
});
