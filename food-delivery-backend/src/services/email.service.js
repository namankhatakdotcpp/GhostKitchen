import { logger } from "../utils/logger.js";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || "GhostKitchen <noreply@ghostkitchen.in>";
const BASE_URL = "https://api.resend.com/emails";

async function send({ to, subject, html }) {
  if (!RESEND_API_KEY) return; // Silently skip when not configured
  try {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.warn("[Email] Resend API error", { status: res.status, body });
    }
  } catch (err) {
    logger.warn("[Email] Send failed", { error: err.message });
  }
}

// ─── Templates ────────────────────────────────────────────────────────────────

function wrap(content) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;background:#F9FAFB}
.card{max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB}
.header{background:#FF5200;padding:24px 32px}.header h1{color:#fff;margin:0;font-size:22px;font-weight:800}
.body{padding:32px}.body p{color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px}
.btn{display:inline-block;background:#FF5200;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:700;font-size:14px}
.meta{background:#F9FAFB;border-radius:10px;padding:16px;margin:20px 0}
.meta p{margin:4px 0;font-size:13px;color:#6B7280}
.meta strong{color:#111827}
.footer{padding:20px 32px;border-top:1px solid #F3F4F6;color:#9CA3AF;font-size:12px}
</style></head><body><div class="card">${content}</div></body></html>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendOrderPlacedEmail({ to, name, orderId, restaurantName, items, total }) {
  const itemList = (items || []).map((i) => `<p><strong>${i.name}</strong> × ${i.quantity} — ₹${(i.price * i.quantity).toFixed(0)}</p>`).join("");
  await send({
    to,
    subject: `Order confirmed – #${orderId.slice(0, 8).toUpperCase()}`,
    html: wrap(`
      <div class="header"><h1>Order Placed!</h1></div>
      <div class="body">
        <p>Hi ${name}, your order from <strong>${restaurantName}</strong> has been placed successfully.</p>
        <div class="meta">${itemList}<p style="margin-top:12px;border-top:1px solid #E5E7EB;padding-top:12px"><strong>Total: ₹${total}</strong></p></div>
        <p>We'll notify you when the restaurant accepts your order.</p>
      </div>
      <div class="footer">GhostKitchen &copy; ${new Date().getFullYear()}</div>
    `),
  });
}

export async function sendOrderStatusEmail({ to, name, orderId, status, restaurantName }) {
  const messages = {
    CONFIRMED: { subject: "Your order is being prepared!", body: "Great news — the restaurant has accepted your order and is getting it ready." },
    OUT_FOR_DELIVERY: { subject: "Your order is on its way!", body: "Your delivery partner has picked up your order and is heading to you." },
    DELIVERED: { subject: "Order delivered!", body: "Your order has been delivered. Enjoy your meal!" },
    CANCELLED: { subject: "Order cancelled", body: "Your order has been cancelled. If you were charged, a refund will be initiated." },
  };
  const msg = messages[status];
  if (!msg) return;
  await send({
    to,
    subject: `${msg.subject} – #${orderId.slice(0, 8).toUpperCase()}`,
    html: wrap(`
      <div class="header"><h1>${msg.subject}</h1></div>
      <div class="body">
        <p>Hi ${name}, ${msg.body}</p>
        <div class="meta">
          <p>Order <strong>#${orderId.slice(0, 8).toUpperCase()}</strong> from <strong>${restaurantName}</strong></p>
        </div>
      </div>
      <div class="footer">GhostKitchen &copy; ${new Date().getFullYear()}</div>
    `),
  });
}

export async function sendMaintenanceEmail({ to, name, reason, scheduledAt, endsAt }) {
  const fmt = (iso) => iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : null;
  const startStr = scheduledAt ? `Starts at: <strong>${fmt(scheduledAt)}</strong>` : "Starting now";
  const endStr = endsAt ? `Expected end: <strong>${fmt(endsAt)}</strong>` : "";
  await send({
    to,
    subject: "GhostKitchen – Scheduled Maintenance",
    html: wrap(`
      <div class="header"><h1>Scheduled Maintenance</h1></div>
      <div class="body">
        <p>Hi ${name}, GhostKitchen will be undergoing scheduled maintenance.</p>
        <div class="meta">
          ${reason ? `<p>Reason: <strong>${reason}</strong></p>` : ""}
          <p>${startStr}</p>
          ${endStr ? `<p>${endStr}</p>` : ""}
        </div>
        <p>The platform will be temporarily unavailable. We'll restore service as quickly as possible.</p>
      </div>
      <div class="footer">GhostKitchen &copy; ${new Date().getFullYear()}</div>
    `),
  });
}

export async function sendRestaurantApprovedEmail({ to, name, restaurantName }) {
  await send({
    to,
    subject: "Your restaurant is live on GhostKitchen!",
    html: wrap(`
      <div class="header"><h1>You're Live!</h1></div>
      <div class="body">
        <p>Hi ${name}, <strong>${restaurantName}</strong> has been approved and is now visible to customers on GhostKitchen.</p>
        <p>Log in to your dashboard to manage your menu and start accepting orders.</p>
      </div>
      <div class="footer">GhostKitchen &copy; ${new Date().getFullYear()}</div>
    `),
  });
}
