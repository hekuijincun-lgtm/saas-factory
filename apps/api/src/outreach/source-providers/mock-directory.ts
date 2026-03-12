// Mock Directory Provider (Phase 6)
// ============================================================
// Returns deterministic mock data for development and testing.
// Replace with real Google Maps / directory API in future.

import type { SourceProvider, SourceSearchInput, SourceSearchResult, CandidateResult } from "./types";

const MOCK_DATA: CandidateResult[] = [
  {
    storeName: "サンプル美容室 表参道",
    category: "美容室",
    area: "表参道",
    address: "東京都渋谷区神宮前4-1-1",
    websiteUrl: "https://sample-salon-omotesando.example.com",
    phone: "03-1234-5678",
    rating: 4.2,
    reviewCount: 85,
    sourceUrl: "https://maps.example.com/place/sample1",
    externalId: "mock_001",
  },
  {
    storeName: "ビューティーラボ 青山",
    category: "美容室",
    area: "青山",
    address: "東京都港区南青山3-2-1",
    websiteUrl: "https://beauty-lab-aoyama.example.com",
    phone: "03-2345-6789",
    rating: 4.5,
    reviewCount: 120,
    sourceUrl: "https://maps.example.com/place/sample2",
    externalId: "mock_002",
  },
  {
    storeName: "ネイルサロン Fleur",
    category: "ネイルサロン",
    area: "渋谷",
    address: "東京都渋谷区宇田川町10-5",
    websiteUrl: "https://nail-fleur.example.com",
    phone: "03-3456-7890",
    email: "info@nail-fleur.example.com",
    rating: 4.0,
    reviewCount: 42,
    sourceUrl: "https://maps.example.com/place/sample3",
    externalId: "mock_003",
  },
  {
    storeName: "リラクゼーション 癒し処",
    category: "マッサージ",
    area: "新宿",
    address: "東京都新宿区歌舞伎町1-8-3",
    websiteUrl: "https://iyashidokoro.example.com",
    rating: 3.8,
    reviewCount: 28,
    sourceUrl: "https://directory.example.com/place/sample4",
    externalId: "mock_004",
  },
  {
    storeName: "アイブロウサロン BROW",
    category: "アイブロウ",
    area: "恵比寿",
    address: "東京都渋谷区恵比寿南1-5-2",
    websiteUrl: "https://brow-salon.example.com",
    email: "contact@brow-salon.example.com",
    rating: 4.7,
    reviewCount: 210,
    sourceUrl: "https://maps.example.com/place/sample5",
    externalId: "mock_005",
  },
];

export class MockDirectoryProvider implements SourceProvider {
  readonly name = "mock-directory";
  readonly sourceType = "directory";

  async searchCandidates(input: SourceSearchInput): Promise<SourceSearchResult> {
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 200));

    let filtered = [...MOCK_DATA];

    // Simple keyword filtering
    if (input.query) {
      const q = input.query.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.storeName.toLowerCase().includes(q) ||
          (c.category?.toLowerCase().includes(q)) ||
          (c.area?.toLowerCase().includes(q))
      );
    }

    if (input.niche) {
      const n = input.niche.toLowerCase();
      filtered = filtered.filter((c) => c.category?.toLowerCase().includes(n));
    }

    if (input.location) {
      const l = input.location.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          (c.area?.toLowerCase().includes(l)) ||
          (c.address?.toLowerCase().includes(l))
      );
    }

    // If no filters match, return all mock data (for demo purposes)
    if (filtered.length === 0 && input.query) {
      filtered = MOCK_DATA;
    }

    const max = input.maxResults ?? 20;
    const truncated = filtered.length > max;
    const candidates = filtered.slice(0, max);

    return { candidates, totalFound: filtered.length, truncated };
  }
}
