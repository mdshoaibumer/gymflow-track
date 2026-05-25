"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TourStep {
  title: string;
  description: string;
  target?: string; // CSS selector for spotlight
  position?: "top" | "bottom" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to GymFlow Track! 🎉",
    description:
      "Let's take a quick tour to help you get started. You'll be managing your gym like a pro in no time.",
  },
  {
    title: "Dashboard Overview",
    description:
      "Your dashboard shows key metrics at a glance — revenue, active members, attendance, and more. Everything updates in real time.",
    target: "#main-content",
    position: "bottom",
  },
  {
    title: "Quick Navigation",
    description:
      "Use the sidebar to navigate between sections. Press Cmd+K (or Ctrl+K) to open the command palette for instant access to any page.",
    position: "right",
  },
  {
    title: "Member Management",
    description:
      "Add members, track their memberships, and manage renewals. You can also import members from a CSV file.",
    position: "right",
  },
  {
    title: "You're All Set!",
    description:
      "Start by adding your first member or explore the dashboard. You can access help anytime from the feedback button.",
  },
];

const STORAGE_KEY = "gymflow-tour-completed";

export function OnboardingTour() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Check if tour has been completed
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      // Delay showing tour to let the page load
      const timer = setTimeout(() => setIsOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleComplete = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsOpen(false);
  }, []);

  const handleNext = useCallback(() => {
    if (step < TOUR_STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      handleComplete();
    }
  }, [step, handleComplete]);

  const handlePrev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  const handleSkip = useCallback(() => {
    handleComplete();
  }, [handleComplete]);

  if (!isOpen) return null;

  const currentStep = TOUR_STEPS[step];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop overlay */}
          <motion.div
            className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleSkip}
          />
          {/* Tour card */}
          <motion.div
            className="fixed z-[201] left-1/2 top-1/2 w-[90vw] max-w-md"
            initial={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
            animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
            exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="rounded-2xl border bg-card p-6 shadow-soft-lg">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    {step + 1} of {TOUR_STEPS.length}
                  </span>
                </div>
                <button
                  onClick={handleSkip}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Close tour"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Content */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  <h3 className="text-lg font-semibold tracking-tight mb-2">
                    {currentStep.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {currentStep.description}
                  </p>
                </motion.div>
              </AnimatePresence>

              {/* Progress dots */}
              <div className="flex items-center justify-center gap-1.5 mt-5 mb-4">
                {TOUR_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-200",
                      i === step
                        ? "w-6 bg-primary"
                        : i < step
                          ? "w-1.5 bg-primary/40"
                          : "w-1.5 bg-muted-foreground/20"
                    )}
                  />
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  className="text-xs text-muted-foreground"
                >
                  Skip tour
                </Button>
                <div className="flex items-center gap-2">
                  {step > 0 && (
                    <Button variant="outline" size="sm" onClick={handlePrev}>
                      <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                      Back
                    </Button>
                  )}
                  <Button size="sm" onClick={handleNext}>
                    {step === TOUR_STEPS.length - 1 ? "Get Started" : "Next"}
                    {step < TOUR_STEPS.length - 1 && (
                      <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
