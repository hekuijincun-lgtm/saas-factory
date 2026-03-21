import type { Metadata } from 'next';
import SeitaiDemo from './SeitaiDemo';

export const metadata: Metadata = {
  title: '整体院AIデモ | LumiBook',
  description: '整体院向けAI受付コンシェルジュのデモ体験。症状ヒアリング＆コース提案をお試しください。',
};

export default function SeitaiDemoPage() {
  return <SeitaiDemo />;
}
