import { LandingProviders } from "./landing-providers";
import { Navbar } from "./navbar";
import { Hero } from "./hero";
import { NicheStrip } from "./niche-strip";
import { AppPicker } from "./app-picker";
import { Features } from "./features";
import { HowItWorks } from "./how-it-works";
import { VSLSection } from "./vsl-section";
import { CaseStudy } from "./case-study";
import { PricingSection } from "./pricing-section";
import { FAQ } from "./faq";
import { FinalCTA } from "./final-cta";
import { Footer } from "./footer";

/**
 * Atlas Engine marketing landing page — CP-145 (simplified redesign).
 *
 * Nine sections, white page, one message per section:
 *   Hero (promise + phone) → who it's for → preview your app →
 *   what it does (4 cards) → how it works (3 steps) → video →
 *   live install → pricing → FAQ → final CTA.
 *
 * One primary objective everywhere: "Book a free demo" (DemoCta).
 * Retired from the page (files kept for reference): ProblemSection,
 * InteractiveDemo, RewardsDemo, FeatureShowcase, AnalyticsDemo,
 * BeforeAfter, SocialProof, TeamSection, AgencyWaitlist, LogoCloud,
 * OceanBackdrop.
 */
export function LandingPage({ fontClassName = "" }: { fontClassName?: string }) {
  return (
    <LandingProviders fontClassName={fontClassName}>
      <div className={`lp-root lp-page ${fontClassName} min-h-screen antialiased`}>
        <Navbar />
        <main id="main">
          <Hero />
          <NicheStrip />
          <AppPicker />
          <Features />
          <HowItWorks />
          <VSLSection />
          <CaseStudy />
          <PricingSection />
          <FAQ />
          <FinalCTA />
        </main>
        <Footer />
      </div>
    </LandingProviders>
  );
}
