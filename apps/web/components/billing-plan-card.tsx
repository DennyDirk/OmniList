"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { workspacePlans, type WorkspacePlan, type WorkspaceUsage } from "@omnilist/shared";

import { dictionaries, type Locale } from "../lib/i18n";
import { useFlash } from "./flash-provider";

interface BillingPlanCardProps {
  apiBaseUrl: string;
  currentPlan: WorkspacePlan;
  locale: Locale;
  usage: WorkspaceUsage;
}

export function BillingPlanCard({ apiBaseUrl, currentPlan, locale, usage }: BillingPlanCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { showFlash } = useFlash();
  const dictionary = dictionaries[locale];

  function getPlanLabel(planId: WorkspacePlan) {
    return planId === "pro" ? "Pro" : "Free";
  }

  async function handlePlanChange(subscriptionPlan: WorkspacePlan) {
    const response = await fetch(`${apiBaseUrl}/workspace/plan`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        subscriptionPlan
      })
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as { message?: string } | undefined;
      showFlash({
        tone: "error",
        message: body?.message ?? "Could not update workspace plan."
      });
      return;
    }

    showFlash({
      tone: "success",
      message: dictionary.billingPage.updated
    });
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="grid product-grid">
      {Object.values(workspacePlans).map((plan) => {
        const isActive = plan.id === currentPlan;

        return (
          <article className="card" key={plan.id}>
            <div className="row">
              <h3>{getPlanLabel(plan.id)}</h3>
              <span className={`pill ${isActive ? "ready" : ""}`}>
                {isActive ? dictionary.billingPage.activePlan : `$${plan.monthlyPriceUsd}/mo`}
              </span>
            </div>
            <p className="muted">
              {plan.productLimit === null ? "Unlimited products included" : `${plan.productLimit} products included`}
            </p>
            <div className="list">
              <div className="list-item">
                {usage.subscriptionPlan === plan.id
                  ? dictionary.billingPage.productUsage(usage.productCount, usage.productLimit)
                  : plan.productLimit === null
                    ? "Unlimited catalog size"
                    : `${plan.productLimit} product limit`}
              </div>
              <div className="list-item">{plan.aiIncluded ? dictionary.billingPage.aiIncluded : dictionary.billingPage.aiNotIncluded}</div>
            </div>
            <button
              className="button-primary"
              disabled={isPending || isActive}
              onClick={() => void handlePlanChange(plan.id)}
              type="button"
            >
              {isPending ? dictionary.billingPage.processing : plan.id === "pro" ? dictionary.billingPage.switchToPro : dictionary.billingPage.switchToFree}
            </button>
          </article>
        );
      })}
    </div>
  );
}
