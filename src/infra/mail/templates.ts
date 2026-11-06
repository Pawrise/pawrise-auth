import type { MailMessage } from './mailer';

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F4F8FB;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#123044">
<div style="max-width:480px;margin:0 auto;padding:32px 20px">
<p style="font-size:20px;font-weight:700;margin:0 0 24px">🐾 Pawrise</p>
<div style="background:#fff;border-radius:20px;padding:24px">
<h1 style="font-size:20px;margin:0 0 12px">${title}</h1>${body}</div>
<p style="font-size:12px;color:#5A7082;margin-top:16px">Vous recevez ce message car une action a été demandée sur votre compte Pawrise. Si ce n'est pas vous, ignorez-le.</p>
</div></body></html>`;
}

export function verifyEmailMessage(to: string, firstName: string, link: string): MailMessage {
  return {
    to,
    subject: 'Confirmez votre adresse e-mail',
    text: `Bonjour ${firstName},\n\nConfirmez votre adresse e-mail en ouvrant ce lien (valable 24 heures) :\n${link}\n\nL'équipe Pawrise`,
    html: layout(
      'Confirmez votre adresse e-mail',
      `<p>Bonjour ${escape(firstName)},</p><p>Touchez le bouton pour confirmer votre adresse. Le lien est valable 24 heures.</p>
<p><a href="${escape(link)}" style="display:inline-block;background:#0A5C78;color:#fff;text-decoration:none;padding:14px 20px;border-radius:16px;font-weight:600">Confirmer mon adresse</a></p>`,
    ),
  };
}

export function resetPasswordMessage(to: string, firstName: string, code: string): MailMessage {
  return {
    to,
    subject: `${code} : votre code Pawrise`,
    text: `Bonjour ${firstName},\n\nVotre code pour choisir un nouveau mot de passe : ${code}\nIl est valable 15 minutes.\n\nSi vous n'avez rien demandé, ignorez ce message : votre mot de passe ne change pas.\n\nL'équipe Pawrise`,
    html: layout(
      'Votre code de réinitialisation',
      `<p>Bonjour ${escape(firstName)},</p><p>Saisissez ce code dans l'app pour choisir un nouveau mot de passe. Il est valable 15 minutes.</p>
<p style="font-family:ui-monospace,Menlo,monospace;font-size:32px;letter-spacing:6px;font-weight:700;margin:16px 0">${code}</p>
<p>Si vous n'avez rien demandé, ignorez ce message : votre mot de passe ne change pas.</p>`,
    ),
  };
}
