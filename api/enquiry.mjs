// NewCo Solutions website forms: emails each submission to the right NewCo address
// and sends the visitor an automatic confirmation. Uses Resend (RESEND_API_KEY).
export const config = { maxDuration: 15 };

const DOMAIN = 'newcosolutions.org';
const FROM_SITE = `NewCo Solutions Website <website@${DOMAIN}>`;
const FROM_REPLY = `NewCo Solutions <info@${DOMAIN}>`;
const FORMS = {
  quote:   { to: `sales@${DOMAIN}`,        label: 'Quote request',   thanks: 'Thank you for your enquiry. We have received it and will review it against our supplier channels. If we need anything else, we will ask before verification starts.' },
  contact: { to: `info@${DOMAIN}`,         label: 'Website message', thanks: 'Thank you for your message. We have received it and will reply by email.' },
  partner: { to: `partnerships@${DOMAIN}`, label: 'Partner enquiry', thanks: 'Thank you for your partner enquiry. We read every enquiry against our supply areas and will reply to arrange an introduction where there is a fit.' },
};
const FILE_OK = /\.(pdf|docx|xlsx|jpe?g)$/i, FILE_MAX = 4 * 1024 * 1024;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function table(fields) {
  return '<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;font:14px/1.5 Arial,sans-serif;color:#162F31">' +
    fields.map(([k, v]) => `<tr><td style="border-bottom:1px solid #E3EFE5;width:160px;color:#4A5D5E;vertical-align:top">${esc(k)}</td><td style="border-bottom:1px solid #E3EFE5;white-space:pre-wrap">${esc(v)}</td></tr>`).join('') + '</table>';
}
function shell(inner) {
  return `<div style="background:#F2F3EF;padding:32px 16px"><div style="max-width:560px;margin:0 auto;background:#ffffff;border-top:4px solid #73D199">
  <div style="background:#162F31;padding:20px 28px;font:600 13px/1 Arial,sans-serif;letter-spacing:.18em;color:#F4F3EE">NEWCO SOLUTIONS</div>
  <div style="padding:28px;font:15px/1.6 Arial,sans-serif;color:#162F31">${inner}</div>
  <div style="padding:16px 28px;border-top:1px solid #E3EFE5;font:12px/1.5 Arial,sans-serif;color:#4A5D5E">NEWCO SOLUTION LTD · RC 9826940 · Nigeria<br>${DOMAIN}</div></div></div>`;
}
async function send(key, payload) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

export async function POST(request) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return json(500, { ok: false, error: 'not_configured' });
  let fd;
  try { fd = await request.formData(); } catch { return json(400, { ok: false, error: 'bad_request' }); }
  const form = FORMS[String(fd.get('_form') || '')];
  if (!form) return json(400, { ok: false, error: 'unknown_form' });
  if (String(fd.get('_honey') || '')) return json(200, { ok: true });           // bot trap: pretend success
  const t0 = Number(fd.get('_t') || 0);
  if (t0 && Date.now() - t0 < 2500) return json(200, { ok: true });             // filled in under 2.5 s: a bot

  const fields = [];
  for (const [k, v] of fd.entries()) {
    if (k.startsWith('_') || typeof v !== 'string') continue;
    fields.push([k.slice(0, 60), v.slice(0, 5000)]);
  }
  const get = n => (fields.find(([k]) => k.toLowerCase() === n) || [, ''])[1].trim();
  const email = get('email'), name = get('name') || 'there';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return json(400, { ok: false, error: 'bad_email' });

  const attachments = [];
  const file = fd.get('attachment');
  if (file && typeof file === 'object' && file.size) {
    if (!FILE_OK.test(file.name) || file.size > FILE_MAX) return json(400, { ok: false, error: 'bad_file' });
    attachments.push({ filename: file.name.slice(0, 120), content: Buffer.from(await file.arrayBuffer()).toString('base64') });
  }
  const subject = String(fd.get('_subject') || form.label).slice(0, 150);

  try {
    await send(key, {
      from: FROM_SITE, to: [form.to], reply_to: email, subject,
      html: shell(`<p style="margin:0 0 6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#2E8A5A">${esc(form.label)}</p>
        <h1 style="margin:0 0 20px;font:400 22px/1.3 Arial,sans-serif">${esc(subject)}</h1>${table(fields)}
        <p style="margin:20px 0 0;font-size:13px;color:#4A5D5E">Reply to this email to answer ${esc(name)} directly.${attachments.length ? ' Their file is attached.' : ''}</p>`),
      text: fields.map(([k, v]) => `${k}: ${v}`).join('\n'),
      attachments,
    });
  } catch (e) {
    console.error(e);
    return json(502, { ok: false, error: 'send_failed' });
  }
  try {   // the confirmation is a courtesy: a failure here must not fail the submission
    await send(key, {
      from: FROM_REPLY, to: [email], reply_to: form.to, subject: `We have your ${form.label.toLowerCase()} · NewCo Solutions`,
      html: shell(`<p style="margin:0 0 16px">Hello ${esc(name)},</p><p style="margin:0 0 16px">${esc(form.thanks)}</p>
        <p style="margin:0 0 24px">For reference, here is what you sent:</p>${table(fields)}
        <p style="margin:24px 0 0">NewCo Solutions<br><span style="color:#4A5D5E">Reply to this email if you want to add anything.</span></p>`),
      text: `Hello ${name},\n\n${form.thanks}\n\nNewCo Solutions`,
    });
  } catch (e) { console.error('autoreply', e); }
  return json(200, { ok: true });
}

export function GET() { return json(405, { ok: false }); }
