/**
 * React Query hooks for AVANA Commerce, Monetization, Subscriptions, and Paywalls.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import {
  createCommerceApi,
  type CheckoutRequest,
  type VerifyPaymentRequest,
} from "../lib/api/commerce.js";

function getCommerceApi() {
  const client = createApiClient({ baseUrl: getApiBaseUrl() });
  return createCommerceApi(client);
}

/**
 * Fetch all available sellable products (subscription plans, etc.).
 */
export function useCommerceProducts() {
  const api = getCommerceApi();
  return useQuery({
    queryKey: ["commerce-products"],
    queryFn: () => api.listProducts(),
    staleTime: 60_000,
  });
}

/**
 * Fetch current user's active subscription status.
 */
export function useMySubscription() {
  const api = getCommerceApi();
  return useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => api.getMySubscription(),
    staleTime: 30_000,
  });
}

/**
 * Fetch current user's active entitlements.
 */
export function useMyEntitlements() {
  const api = getCommerceApi();
  return useQuery({
    queryKey: ["my-entitlements"],
    queryFn: () => api.getMyEntitlements(),
    staleTime: 30_000,
  });
}

/**
 * Query centralized access decision for a specific resource.
 */
export function useCheckAccess(params: {
  resourceType: string;
  resourceId?: string | null;
  courseId?: string;
  contentPackId?: string;
  enabled?: boolean;
}) {
  const api = getCommerceApi();
  return useQuery({
    queryKey: [
      "access-check",
      params.resourceType,
      params.resourceId,
      params.courseId,
      params.contentPackId,
    ],
    queryFn: () =>
      api.checkAccess({
        resourceType: params.resourceType,
        resourceId: params.resourceId!,
        courseId: params.courseId,
        contentPackId: params.contentPackId,
      }),
    enabled:
      params.enabled !== false &&
      Boolean(params.resourceId && params.resourceId.trim().length > 0),
    staleTime: 15_000,
  });
}

/**
 * Fetch current user's order history.
 */
export function useMyOrders() {
  const api = getCommerceApi();
  return useQuery({
    queryKey: ["my-orders"],
    queryFn: () => api.getMyOrders(),
    staleTime: 15_000,
  });
}

/**
 * Mutation to initiate checkout and retrieve payment gateway URL.
 */
export function useCheckout() {
  const api = getCommerceApi();
  return useMutation({
    mutationFn: (data: CheckoutRequest) => api.checkout(data),
    onSuccess: (res) => {
      if (res.payment_url) {
        window.location.href = res.payment_url;
      }
    },
  });
}

/**
 * Mutation to verify payment authority after return from gateway.
 */
export function useVerifyPayment() {
  const queryClient = useQueryClient();
  const api = getCommerceApi();

  return useMutation({
    mutationFn: (data: VerifyPaymentRequest) => api.verifyPayment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-subscription"] });
      queryClient.invalidateQueries({ queryKey: ["my-entitlements"] });
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      queryClient.invalidateQueries({ queryKey: ["access-check"] });
    },
  });
}

/**
 * Fetch Card-to-Card payment availability and destination details.
 */
export function useCardToCardInfo() {
  const api = getCommerceApi();
  return useQuery({
    queryKey: ["card-to-card-info"],
    queryFn: () => api.getCardToCardInfo(),
    staleTime: 60_000,
  });
}

/**
 * Mutation to extract structured payment information from pasted text.
 */
export function useExtractCardToCardPayment() {
  const api = getCommerceApi();
  return useMutation({
    mutationFn: (data: import("../lib/api/commerce.js").ExtractPaymentRequest) =>
      api.extractCardToCardPaymentInfo(data),
  });
}

/**
 * Mutation to submit card-to-card payment with instant subscription activation.
 */
export function useSubmitCardToCardPayment() {
  const queryClient = useQueryClient();
  const api = getCommerceApi();

  return useMutation({
    mutationFn: (data: import("../lib/api/commerce.js").CardToCardPaymentRequest) =>
      api.submitCardToCardPayment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-subscription"] });
      queryClient.invalidateQueries({ queryKey: ["my-entitlements"] });
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      queryClient.invalidateQueries({ queryKey: ["access-check"] });
    },
  });
}
