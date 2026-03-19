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
export declare function initBilling(): boolean;
export declare function isBillingEnabled(): boolean;
/**
 * Create a Stripe Checkout session for managed subscription.
 */
export declare function createCheckoutSession(params: {
    workspaceId: string;
    userId: string;
    email?: string;
    successUrl: string;
    cancelUrl: string;
}): Promise<{
    url: string;
}>;
/**
 * Create a Stripe Billing Portal session for managing subscription.
 */
export declare function createPortalSession(params: {
    customerId: string;
    returnUrl: string;
}): Promise<{
    url: string;
}>;
/**
 * Record a completed API task for usage-based billing.
 * Uses Stripe's Billing Meter Events API.
 */
export declare function recordTaskUsage(params: {
    workspaceId: string;
    taskId: string;
    steps: number;
    inputTokens: number;
    outputTokens: number;
}): Promise<void>;
/**
 * Handle Stripe webhook events.
 * Returns true if the event was handled, false if not recognized.
 */
export declare function handleWebhook(rawBody: string, signature: string): Promise<{
    handled: boolean;
    event?: string;
}>;
