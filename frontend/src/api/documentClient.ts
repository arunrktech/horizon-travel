import { API_BASE_URL, USE_MOCK } from "./config";
import { request } from "./http";
import { mock } from "./mock/mockBackend";
import type { TravelDocument } from "./types";

export interface DocumentClient {
  forBooking(bookingId: string): Promise<TravelDocument[]>;
}

const real: DocumentClient = {
  async forBooking(bookingId) {
    const docs = await request<TravelDocument[]>("GET", "/api/documents", { query: { bookingId } });
    // Local storage mode returns relative signed links; S3 mode returns absolute presigned URLs.
    return docs.map((d) => ({ ...d, downloadUrl: d.downloadUrl.startsWith("/") ? `${API_BASE_URL}${d.downloadUrl}` : d.downloadUrl }));
  },
};

const fake: DocumentClient = { forBooking: mock.documents };

export const documentClient: DocumentClient = USE_MOCK ? fake : real;
