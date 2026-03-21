import { redirect } from "next/navigation";
import SignupForm from "../_components/SignupForm";

const VALID_VERTICALS = [
  "eyebrow", "nail", "dental", "hair", "esthetic",
  "cleaning", "handyman", "pet", "seitai", "gym", "school",
  "shop", "food", "handmade", "construction", "reform", "equipment",
] as const;

export const dynamicParams = false;

export function generateStaticParams() {
  return VALID_VERTICALS.map((v) => ({ vertical: v }));
}

export async function generateMetadata({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = await params;
  const LABELS: Record<string, string> = {
    eyebrow: "アイブロウサロン", nail: "ネイルサロン", hair: "ヘアサロン",
    esthetic: "エステ・リラクゼーション", dental: "歯科・クリニック",
    cleaning: "ハウスクリーニング", handyman: "便利屋・なんでも屋",
    pet: "ペットサロン", seitai: "整体院",
    gym: "ジム・フィットネス", school: "習い事・スクール",
    shop: "ネットショップ", food: "食品・お取り寄せ",
    handmade: "ハンドメイド・クリエイター",
    construction: "工務店・建設", reform: "リフォーム", equipment: "設備工事",
  };
  const label = LABELS[vertical] ?? vertical;
  return {
    title: `${label}向け サービス登録 | LumiBook`,
    description: `${label}の予約・顧客管理をAIで自動化。LumiBookに無料登録してすぐに始められます。`,
  };
}

export default async function VerticalSignupPage({
  params,
}: {
  params: Promise<{ vertical: string }>;
}) {
  const { vertical } = await params;

  // generic → redirect to plain /signup
  if (vertical === "generic") {
    redirect("/signup");
  }

  return <SignupForm initialVertical={vertical} />;
}
