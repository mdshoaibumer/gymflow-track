"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Password reset is not yet available — show honest message
    setSubmitted(true);
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        <Card>
          <CardHeader className="text-center">
            <Link href="/" className="text-2xl font-bold text-primary mb-2 block">
              GymFlow
            </Link>
            <CardTitle className="text-xl">Reset Password</CardTitle>
            <CardDescription>
              Password reset is coming soon
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="text-center space-y-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Mail className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Password reset is not yet available. Please contact your gym
                  administrator or reach out to{" "}
                  <strong>support@gymflow.in</strong> for assistance.
                </p>
                <Button variant="outline" asChild className="w-full">
                  <Link href="/login">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Login
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="owner@yourgym.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    Send Reset Link
                  </Button>
                </form>
                <p className="mt-6 text-center text-sm text-muted-foreground">
                  <Link href="/login" className="text-primary font-medium hover:underline">
                    <ArrowLeft className="inline mr-1 h-3 w-3" />
                    Back to Login
                  </Link>
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}
