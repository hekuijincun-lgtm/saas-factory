'use client';

import { useEffect, useState } from 'react';
import Hero from './sections/Hero';
import SocialProof from './sections/SocialProof';
import WhyDifferent from './sections/WhyDifferent';
import ThreeLevers from './sections/ThreeLevers';
import DayInLife from './sections/DayInLife';
import Testimonials from './sections/Testimonials';
import Pricing from './sections/Pricing';
import Faq from './sections/Faq';
import LpFooter from './sections/LpFooter';
import IosInstallSheet from './IosInstallSheet';
import AndroidInstallSheet from './AndroidInstallSheet';
import InstalledNotice from './InstalledNotice';
import FloatingCta from './components/FloatingCta';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function LpPetClient() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosSheet, setShowIosSheet] = useState(false);
  const [showAndroidSheet, setShowAndroidSheet] = useState(false);
  const [showInstalledNotice, setShowInstalledNotice] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop' | 'unknown'>('unknown');
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // --- 1. beforeinstallprompt は最初にキャプチャ（SW登録より先） ---
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // --- 2. platform 判定 ---
    const ua = navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua) && !/crios|fxios/.test(ua);
    const isAndroid = /android/.test(ua);
    if (isIos) setPlatform('ios');
    else if (isAndroid) setPlatform('android');
    else setPlatform('desktop');

    // --- 3. インストール済み判定（厳密に） ---
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    const iosStandalone = (navigator as any).standalone === true;
    if (standalone || iosStandalone) setIsInstalled(true);

    // --- 4. appinstalled イベントで検知 ---
    const onInstalled = () => { setIsInstalled(true); setShowAndroidSheet(false); };
    window.addEventListener('appinstalled', onInstalled);

    // --- 5. SW登録は最後に ---
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-pet.js', { scope: '/' })
        .catch(err => console.error('[PWA] SW registration failed:', err));
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    // ケース1: インストール済み → アプリから起動案内（/login には飛ばさない）
    if (isInstalled) {
      setShowInstalledNotice(true);
      return;
    }

    // ケース2: iOS Safari → 手順モーダル
    if (platform === 'ios') {
      setShowIosSheet(true);
      return;
    }

    // ケース3: beforeinstallprompt キャプチャ済み → ネイティブダイアログ
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setIsInstalled(true);
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.error('[PWA] install prompt failed:', err);
        setShowAndroidSheet(true);
      }
      return;
    }

    // ケース4: Android だが beforeinstallprompt 未発火 → 手順モーダル
    if (platform === 'android') {
      setShowAndroidSheet(true);
      return;
    }

    // ケース5: デスクトップ → 手順案内
    if (platform === 'desktop') {
      setShowAndroidSheet(true);
      return;
    }

    // ケース6: 非対応
    setShowAndroidSheet(true);
  };

  return (
    <main className="bg-white">
      <Hero />
      <SocialProof />
      <WhyDifferent />
      <ThreeLevers />
      <DayInLife />
      <Testimonials />
      <Pricing onInstall={handleInstall} isInstalled={isInstalled} />
      <Faq onInstall={handleInstall} isInstalled={isInstalled} />
      <LpFooter />

      {showIosSheet && <IosInstallSheet onClose={() => setShowIosSheet(false)} />}
      {showAndroidSheet && <AndroidInstallSheet onClose={() => setShowAndroidSheet(false)} />}
      {showInstalledNotice && <InstalledNotice onClose={() => setShowInstalledNotice(false)} />}

      <FloatingCta onClick={handleInstall} isInstalled={isInstalled} />
    </main>
  );
}
