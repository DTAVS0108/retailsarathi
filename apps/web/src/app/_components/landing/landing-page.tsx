import { LandingAtCounter } from './landing-at-counter';
import { LandingContact } from './landing-contact';
import { LandingFeatures } from './landing-features';
import { LandingFeedback } from './landing-feedback';
import { LandingFlow } from './landing-flow';
import { LandingFooter } from './landing-footer';
import { LandingHeader } from './landing-header';
import { LandingHero } from './landing-hero';
import { LandingLogin } from './landing-login';
import { LandingOverview } from './landing-overview';
import { LandingPlatforms } from './landing-platforms';

export function LandingPage() {
  return (
    <>
      <LandingHeader />
      <main>
        <LandingHero />
        <LandingOverview />
        <LandingFlow />
        <LandingFeatures />
        <LandingPlatforms />
        <LandingAtCounter />
        <LandingLogin />
        <LandingFeedback />
        <LandingContact />
      </main>
      <LandingFooter />
    </>
  );
}
