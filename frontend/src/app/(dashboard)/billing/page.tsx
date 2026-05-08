"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
  billingService,
  type Plan,
  type Subscription,
} from "@/services/billing.service";

const PLAN_FEATURES: Record<string, string[]> = {
  starter: [
    "Up to 50 members",
    "2 staff accounts",
    "Attendance tracking",
    "Payment recording",
    "Basic dashboard",
    "Equipment management",
  ],
  pro: [
    "Up to 500 members",
    "10 staff accounts",
    "Everything in Starter",
    "SMS/WhatsApp reminders",
    "Advanced reports & analytics",
    "Priority support",
  ],
  enterprise: [
    "Unlimited members",
    "50 staff accounts",
    "Everything in Pro",
    "Custom integrations",
    "Dedicated support",
    "Multi-location (coming soon)",
  ],
};

export default function PricingPage() {
  const { token, isOwner } = useAuth();
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [planList, sub] = await Promise.all([
          billingService.getPlans(),
          token ? billingService.getSubscription(token) : null,
        ]);
        setPlans(planList);
        setSubscription(sub);
      } catch {
        // Plans are public, this shouldn't fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  const handleSubscribe = async (tier: string) => {
    if (!token || !isOwner) return;
    setSubscribing(tier);
    setError(null);
    setSuccess(null);

    try {
      const result = await billingService.subscribe(token, tier);

      if (result.razorpay_order_id && result.razorpay_key_id) {
        // Open Razorpay Checkout
        openRazorpayCheckout(result);
      } else {
        // Mock mode — auto-verify
        const verification = await billingService.verifyPayment(token, {
          razorpay_payment_id: `mock_pay_${Date.now()}`,
          razorpay_order_id: result.razorpay_order_id || "mock",
          razorpay_signature: "mock_signature",
        });
        if (verification.verified) {
          setSuccess("Subscription activated! Refreshing...");
          setTimeout(() => window.location.reload(), 1500);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Subscription failed");
    } finally {
      setSubscribing(null);
    }
  };

  const openRazorpayCheckout = (orderData: {
    razorpay_order_id: string | null;
    razorpay_key_id: string | null;
    amount_in_paise: number;
  }) => {
    // Razorpay Checkout script must be loaded in the page
    const Razorpay = (window as unknown as Record<string, unknown>).Razorpay as
      | (new (opts: Record<string, unknown>) => { open: () => void })
      | undefined;

    if (!Razorpay) {
      setError("Payment system not loaded. Please refresh and try again.");
      return;
    }

    const rzp = new Razorpay({
      key: orderData.razorpay_key_id,
      amount: orderData.amount_in_paise,
      currency: "INR",
      name: "GymFlow",
      description: "Subscription Payment",
      order_id: orderData.razorpay_order_id,
      handler: async (response: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) => {
        try {
          const verification = await billingService.verifyPayment(token!, {
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature,
          });
          if (verification.verified) {
            setSuccess("Payment successful! Your subscription is now active.");
            setTimeout(() => window.location.reload(), 1500);
          } else {
            setError("Payment verification failed. Please contact support.");
          }
        } catch {
          setError("Payment verification failed. Please contact support.");
        }
      },
      theme: { color: "#6366f1" },
    });
    rzp.open();
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Plans & Pricing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Simple, transparent pricing for your gym. No hidden fees.
        </p>
      </div>

      {error && (
        <div className="mx-auto max-w-md rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="mx-auto max-w-md rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
          {success}
        </div>
      )}

      {/* Current plan indicator */}
      {subscription && (
        <div className="mx-auto max-w-md rounded-md border bg-muted/50 px-4 py-3 text-center text-sm">
          Current plan: <strong>{subscription.plan.name}</strong>
          {subscription.is_trial && (
            <span className="ml-2 text-amber-600">
              (Trial — {subscription.days_remaining} days left)
            </span>
          )}
          {subscription.status === "active" && (
            <span className="ml-2 text-green-600">(Active)</span>
          )}
          {subscription.status === "past_due" && (
            <span className="ml-2 text-red-600">(Payment overdue)</span>
          )}
        </div>
      )}

      {/* Plan cards */}
      <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrentPlan = subscription?.plan.tier === plan.tier;
          const isPopular = plan.tier === "pro";
          const features = PLAN_FEATURES[plan.tier] || [];

          return (
            <div
              key={plan.id}
              className={`relative rounded-lg border p-6 ${
                isPopular ? "border-primary shadow-lg" : ""
              }`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                  Most Popular
                </div>
              )}

              <div className="text-center">
                <h2 className="text-lg font-bold">{plan.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {plan.description}
                </p>
                <div className="mt-4">
                  <span className="text-3xl font-bold">
                    ₹{(plan.price_in_paise / 100).toLocaleString("en-IN")}
                  </span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </div>

              <ul className="mt-6 space-y-2">
                {features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 text-green-500">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {plan.tier === "enterprise" ? (
                  <button
                    disabled
                    className="w-full rounded-md border px-4 py-2 text-sm text-muted-foreground"
                  >
                    Coming Soon
                  </button>
                ) : isCurrentPlan && subscription?.status === "active" ? (
                  <button
                    disabled
                    className="w-full rounded-md bg-muted px-4 py-2 text-sm"
                  >
                    Current Plan
                  </button>
                ) : (
                  <button
                    onClick={() => handleSubscribe(plan.tier)}
                    disabled={!isOwner || subscribing !== null}
                    className={`w-full rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                      isPopular
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "border hover:bg-accent"
                    }`}
                  >
                    {subscribing === plan.tier
                      ? "Processing..."
                      : isCurrentPlan
                      ? "Renew"
                      : subscription && !subscription.is_trial
                      ? "Upgrade"
                      : "Subscribe"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!isOwner && (
        <p className="text-center text-sm text-muted-foreground">
          Only the gym owner can manage billing.
        </p>
      )}
    </div>
  );
}
