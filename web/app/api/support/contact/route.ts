import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/sendEmail';

export async function POST(req: Request) {
  try {
    const body = await req.json() as unknown;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { name, email, subject, message } = body as Record<string, unknown>;

    if (
      typeof name !== 'string' || !name.trim() ||
      typeof email !== 'string' || !email.includes('@') ||
      typeof subject !== 'string' || !subject.trim() ||
      typeof message !== 'string' || !message.trim()
    ) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;color:#111;">
        <h2 style="margin:0 0 16px;font-size:18px;font-weight:700;">New Support Message</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr>
            <td style="padding:8px 12px;background:#f5f5f5;font-weight:600;width:100px;border-radius:4px 0 0 4px;">Name</td>
            <td style="padding:8px 12px;border:1px solid #e5e5e5;">${name.trim()}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f5f5f5;font-weight:600;">Email</td>
            <td style="padding:8px 12px;border:1px solid #e5e5e5;">${email.trim()}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f5f5f5;font-weight:600;">Subject</td>
            <td style="padding:8px 12px;border:1px solid #e5e5e5;">${subject.trim()}</td>
          </tr>
        </table>
        <div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:6px;padding:16px;">
          <p style="margin:0;white-space:pre-wrap;font-size:14px;line-height:1.6;">${message.trim()}</p>
        </div>
        <p style="margin:20px 0 0;font-size:12px;color:#999;">Sent from the RooGPS Support page</p>
      </div>
    `;

    const result = await sendEmail({
      to: 'hello@roogps.com',
      subject: `[Support] ${subject.trim()} — ${name.trim()}`,
      html,
      replyTo: email.trim(),
    });

    if (!result.ok) {
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
