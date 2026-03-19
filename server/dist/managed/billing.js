/**
 * Stripe Billing Integration (not yet active)
 *
 * Scaffolding for future billing. Currently:
 * - Checkout session creation exists but webhook handlers don't persist subscription status
 * - Usage metering function exists but is never called from task flow
 * - No plan gating — all authenticated users can create tasks
 * - Usage is tracked internally via store.recordUsage(), not via Stripe
 *
 * Before activating billing:
 * 1. Add plan/subscription status to workspace schema
 * 2. Persist webhook results (checkout.session.completed, subscription updates)
 * 3. Wire recordTaskUsage() into task completion flow
 * 4. Add plan gating to task creation
 * 5. Map workspace IDs to Stripe customer IDs
 *
 * Requires env vars:
 * - STRIPE_SECRET_KEY
 * - STRIPE_WEBHOOK_SECRET
 * - STRIPE_MANAGED_PRICE_ID (monthly subscription price)
 * - STRIPE_API_METER_ID (usage meter for API tasks)
 */
import Stripe from "stripe";
let stripe = null;
export function initBilling() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
        console.error("[Billing] No STRIPE_SECRET_KEY — billing disabled");
        return false;
    }
    stripe = new Stripe(key);
    console.error("[Billing] Stripe initialized");
    return true;
}
export function isBillingEnabled() {
    return stripe !== null;
}
// --- Checkout ---
/**
 * Create a Stripe Checkout session for managed subscription.
 */
export async function createCheckoutSession(params) {
    if (!stripe)
        throw new Error("Billing not configured");
    const priceId = process.env.STRIPE_MANAGED_PRICE_ID;
    if (!priceId)
        throw new Error("STRIPE_MANAGED_PRICE_ID not set");
    const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        customer_email: params.email,
        metadata: {
            workspace_id: params.workspaceId,
            user_id: params.userId,
        },
        subscription_data: {
            metadata: {
                workspace_id: params.workspaceId,
            },
        },
    });
    return { url: session.url };
}
/**
 * Create a Stripe Billing Portal session for managing subscription.
 */
export async function createPortalSession(params) {
    if (!stripe)
        throw new Error("Billing not configured");
    const session = await stripe.billingPortal.sessions.create({
        customer: params.customerId,
        return_url: params.returnUrl,
    });
    return { url: session.url };
}
// --- Usage Metering ---
/**
 * Record a completed API task for usage-based billing.
 * Uses Stripe's Billing Meter Events API.
 */
export async function recordTaskUsage(params) {
    if (!stripe)
        return; // Billing not configured — silently skip
    const meterId = process.env.STRIPE_API_METER_ID;
    if (!meterId)
        return; // No meter configured
    try {
        await stripe.billing.meterEvents.create({
            event_name: "browser_task_completed",
            payload: {
                stripe_customer_id: params.workspaceId, // Will need mapping to Stripe customer
                value: "1", // 1 task
            },
        });
    }
    catch (err) {
        // Don't fail the task if billing fails — log and continue
        console.error(`[Billing] Failed to record usage for task ${params.taskId}:`, err.message);
    }
}
// --- Webhooks ---
/**
 * Handle Stripe webhook events.
 * Returns true if the event was handled, false if not recognized.
 */
export async function handleWebhook(rawBody, signature) {
    if (!stripe)
        return { handled: false };
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret)
        return { handled: false };
    let event;
    try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    }
    catch (err) {
        console.error("[Billing] Webhook signature verification failed:", err.message);
        return { handled: false };
    }
    switch (event.type) {
        case "checkout.session.completed": {
            const session = event.data.object;
            const workspaceId = session.metadata?.workspace_id;
            if (workspaceId) {
                console.error(`[Billing] Checkout completed for workspace ${workspaceId}`);
                // TODO: Update workspace plan status in database
            }
            return { handled: true, event: event.type };
        }
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
            const subscription = event.data.object;
            const workspaceId = subscription.metadata?.workspace_id;
            const status = subscription.status;
            console.error(`[Billing] Subscription ${event.type} for workspace ${workspaceId}: ${status}`);
            // TODO: Update workspace plan status based on subscription status
            return { handled: true, event: event.type };
        }
        case "invoice.payment_failed": {
            const invoice = event.data.object;
            console.error(`[Billing] Payment failed for customer ${invoice.customer}`);
            // TODO: Handle failed payment (grace period, disable features, etc.)
            return { handled: true, event: event.type };
        }
        default:
            return { handled: false, event: event.type };
    }
}
