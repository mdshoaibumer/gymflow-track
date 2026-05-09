"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  billingService,
  type Plan,
  type Subscription,
} from "@/services/billing.service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);

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

    try {
      const result = await billingService.subscribe(token, tier);

      if (result.razorpay_order_id && result.razorpay_key_id) {
        openRazorpayCheckout(result);
      } else {
        const verification = await billingService.verifyPayment(token, {
          razorpay_payment_id: `mock_pay_${Date.now()}`,
          razorpay_order_id: result.razorpay_order_id || "mock",
          razorpay_signature: "mock_signature",
        });
        if (verification.verified) {
          toast.success("Subscription activated! Refreshing...");
          setTimeout(() => window.location.reload(), 1500);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Subscription failed");
    } finally {
      setSubscribing(null);
    }
  };

  const openRazorpayCheckout = (orderData: {
    razorpay_order_id: string | null;
    razorpay_key_id: string | null;
    amount_in_paise: number;
  }) => {
    const Razorpay = (window as unknown as Record<string, unknown>).Razorpay as
      | (new (opts: Record<string, unknown>) => { open: () => void })
      | undefined;

    if (!Razorpay) {
      toast.error("Payment system not loaded. Please refresh and try again.");
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
            toast.success("Payment successful! Your subscription is now active.");
            setTimeout(() => window.location.reload(), 1500);
          } else {
            toast.error("Payment verification failed. Please contact support.");
          }
        } catch {
          toast.error("Payment verification failed. Please contact support.");
        }
      },
      theme: { color: "#6366f1" },
    });
    rzp.open();
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Plans & Pricing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Simple, transparent pricing for your gym. No hidden fees.
        </p>
      </div>

      {/* Current plan indicator */}
      {subscription && (
        <Card className="mx-auto max-w-md">
          <CardContent className="flex items-center justify-center gap-2 py-3 text-sm">
            Current plan: <strong>{subscription.plan.name}</strong>
            {subscription.is_trial && (
              <Badge variant="warning">{subscription.days_remaining} days left (trial)</Badge>
            )}
            {subscription.status === "active" && <Badge variant="success">Active</Badge>}
            {subscription.status === "past_due" && <Badge variant="destructive">Payment overdue</Badge>}
          </CardContent>
        </Card>
      )}

      {/* Plan cards */}
      <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrentPlan = subscription?.plan.tier === plan.tier;
          const isPopular = plan.tier === "pro";
          const features = PLAN_FEATURES[plan.tier] || [];

          return (
            <Card
              key={plan.id}
              className={`relative ${isPopular ? "border-primary shadow-lg" : ""}`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                </div>
              )}
              <CardHeader className="text-center">
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-3xl font-bold">
                    ₹{(plan.price_in_paise / 100).toLocaleString("en-IN")}
                  </span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-6">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {plan.tier === "enterprise" ? (
                  <Button variant="outline" className="w-full" disabled>
                    Coming Soon
                  </Button>
                ) : isCurrentPlan && subscription?.status === "active" ? (
                  <Button variant="secondary" className="w-full" disabled>
                    Current Plan
                  </Button>
                ) : (
                  <Button
                    variant={isPopular ? "default" : "outline"}
                    className="w-full"
                    onClick={() => handleSubscribe(plan.tier)}
                    disabled={!isOwner || subscribing !== null}
                  >
                    {subscribing === plan.tier ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {subscribing === plan.tier
                      ? "Processing..."
                      : isCurrentPlan
                        ? "Renew"
                        : subscription && !subscription.is_trial
                          ? "Upgrade"
                          : "Subscribe"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!isOwner && (
        <p className="text-center text-sm text-muted-foreground">
          Only the gym owner can manage billing.
        </p>
      )}
    </motion.div>
  );
}
