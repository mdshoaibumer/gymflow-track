"use client";

import { motion } from "framer-motion";
import { Check, Loader2, X as XIcon, Star } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { formatPaise } from "@/lib/utils";
import { usePlans, useSubscription, useSubscribe, useVerifyPayment } from "@/hooks/use-billing";
import { billingService } from "@/services/billing.service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface PlanFeature {
  label: string;
  included: boolean;
}

const PLAN_FEATURES: Record<string, PlanFeature[]> = {
  starter: [
    { label: "Up to 100 active members", included: true },
    { label: "2 staff accounts", included: true },
    { label: "Member Management", included: true },
    { label: "Payment Tracking", included: true },
    { label: "Smart WhatsApp Reminders", included: true },
    { label: "Basic Dashboard", included: true },
    { label: "Email Support", included: true },
    { label: "QR Attendance", included: false },
    { label: "Advanced Analytics", included: false },
    { label: "Export Reports", included: false },
  ],
  pro: [
    { label: "Up to 500 active members", included: true },
    { label: "5 staff accounts", included: true },
    { label: "Everything in Starter", included: true },
    { label: "QR Attendance", included: true },
    { label: "Advanced Analytics", included: true },
    { label: "Revenue Insights", included: true },
    { label: "Export Reports", included: true },
    { label: "Priority Support", included: true },
    { label: "Multi-Branch", included: false },
    { label: "Automated WhatsApp", included: false },
  ],
  elite: [
    { label: "Unlimited members", included: true },
    { label: "Unlimited staff", included: true },
    { label: "Everything in Pro", included: true },
    { label: "Automated WhatsApp Reminders", included: true },
    { label: "Multi-Branch Ready", included: true },
    { label: "Dedicated Support", included: true },
    { label: "Advanced Business Insights", included: true },
  ],
};

export default function PricingPage() {
  const { token, isOwner } = useAuth();
  const { data: plans = [], isLoading: plansLoading } = usePlans();
  const { data: subscription } = useSubscription();
  const subscribeMutation = useSubscribe();
  const verifyMutation = useVerifyPayment();

  const handleSubscribe = async (tier: string) => {
    if (!token || !isOwner) return;

    try {
      const result = await subscribeMutation.mutateAsync(tier);

      if (result.razorpay_order_id && result.razorpay_key_id) {
        openRazorpayCheckout(result);
      } else if (process.env.NODE_ENV === "development") {
        // Mock payment flow — only available in development
        await verifyMutation.mutateAsync({
          razorpay_payment_id: `mock_pay_${Date.now()}`,
          razorpay_order_id: result.razorpay_order_id || "mock",
          razorpay_signature: "mock_signature",
        });
      } else {
        toast.error("Payment gateway not configured. Please contact support.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Subscription failed");
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
      name: "GymFlow Track",
      description: "Subscription Payment",
      order_id: orderData.razorpay_order_id,
      handler: async (response: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) => {
        try {
          const verification = await verifyMutation.mutateAsync({
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature,
          });
          if (!verification.verified) {
            toast.error("Payment verification failed. Please contact support.");
          }
          // Query invalidation handled by useVerifyPayment hook
        } catch {
          toast.error("Payment verification failed. Please contact support.");
        }
      },
      theme: { color: "#6366f1" },
    });
    rzp.open();
  };

  if (plansLoading) {
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
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrentPlan = subscription?.plan.tier === plan.tier;
          const isPopular = plan.tier === "pro";
          const features = PLAN_FEATURES[plan.tier] || [];

          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col ${isPopular ? "border-primary shadow-lg ring-1 ring-primary/20" : ""}`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground gap-1">
                    <Star className="h-3 w-3" /> Most Popular
                  </Badge>
                </div>
              )}
              <CardHeader className="text-center">
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription className="min-h-[40px]">{plan.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-3xl font-bold">
                    {formatPaise(plan.price_in_paise)}
                  </span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                {plan.yearly_price_in_paise > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    or {formatPaise(plan.yearly_price_in_paise)}/year (save {Math.round((1 - plan.yearly_price_in_paise / (plan.price_in_paise * 12)) * 100)}%)
                  </p>
                )}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <ul className="flex-1 space-y-2.5 mb-6">
                  {features.map((feature) => (
                    <li key={feature.label} className="flex items-start gap-2 text-sm">
                      {feature.included ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      ) : (
                        <XIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
                      )}
                      <span className={feature.included ? "" : "text-muted-foreground"}>
                        {feature.label}
                      </span>
                    </li>
                  ))}
                </ul>

                {isCurrentPlan && subscription?.status === "active" ? (
                  <Button variant="secondary" className="w-full" disabled>
                    Current Plan
                  </Button>
                ) : (
                  <Button
                    variant={isPopular ? "default" : "outline"}
                    className="w-full"
                    onClick={() => handleSubscribe(plan.tier)}
                    disabled={!isOwner || subscribeMutation.isPending}
                  >
                    {subscribeMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {subscribeMutation.isPending
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
