export interface AdConfig {
  enabled: boolean;
  provider: 'none' | 'admob' | 'unity' | 'custom';
  rewardedEnabled: boolean;
}

export interface AdResult {
  shown: boolean;
  rewarded: boolean;
  error: string | null;
}

export interface PremiumStatus {
  isPremium: boolean;
  plan: 'free' | 'premium';
  adFree: boolean;
}

export type AdProvider = {
  showBanner(): Promise<AdResult>;
  showInterstitial(): Promise<AdResult>;
  showRewarded(): Promise<AdResult>;
  getPremiumStatus(): Promise<PremiumStatus>;
  setPremiumStatus(status: PremiumStatus): Promise<void>;
};

class NoOpAdProvider implements AdProvider {
  private config: AdConfig = {
    enabled: false,
    provider: 'none',
    rewardedEnabled: true,
  };

  private premium: PremiumStatus = {
    isPremium: false,
    plan: 'free',
    adFree: false,
  };

  async showBanner(): Promise<AdResult> {
    return { shown: false, rewarded: false, error: null };
  }

  async showInterstitial(): Promise<AdResult> {
    return { shown: false, rewarded: false, error: null };
  }

  async showRewarded(): Promise<AdResult> {
    return { shown: false, rewarded: true, error: null };
  }

  async getPremiumStatus(): Promise<PremiumStatus> {
    return this.premium;
  }

  async setPremiumStatus(status: PremiumStatus): Promise<void> {
    this.premium = status;
  }

  getConfig(): AdConfig {
    return this.config;
  }

  setConfig(config: AdConfig): void {
    this.config = config;
  }
}

let adProvider: AdProvider = new NoOpAdProvider();

export function getAdProvider(): AdProvider {
  return adProvider;
}

export function setAdProvider(provider: AdProvider): void {
  adProvider = provider;
}
