export function isValidTrackingId(trackingId) {
  return /^[A-Za-z0-9_-]{6,64}$/.test(String(trackingId || ""));
}

export function getTrackingIdValidationError(trackingId) {
  const value = String(trackingId || "").trim();
  if (!value) return "trackingId is required";
  if (!isValidTrackingId(value)) return "Invalid trackingId format";
  return null;
}

export function buildPublicTrackingPayload(trip) {
  const status = trip?.status;
  const isTrackingActive = status === "ACTIVE";
  const isTerminal = status === "SAFE" || status === "SOS";
  const hasLiveLocation = trip?.lastKnownLat !== null && trip?.lastKnownLat !== undefined &&
    trip?.lastKnownLng !== null && trip?.lastKnownLng !== undefined;

  return {
    trackingId: trip?.trackingId,
    tripName: trip?.tripName,
    status,
    isTrackingActive,
    isTerminal,
    hasLiveLocation,
    expectedEndTime: trip?.expectedEndTime ?? null,
    lastKnownLat: trip?.lastKnownLat ?? null,
    lastKnownLng: trip?.lastKnownLng ?? null,
    lastLocationUpdatedAt: hasLiveLocation ? trip?.updatedAt ?? null : null,
    updatedAt: trip?.updatedAt ?? null,
  };
}
