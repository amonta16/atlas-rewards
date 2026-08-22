import { LandingProviders } from "./landing-providers";
import { Navbar } from "./navbar";
import { Hero } from "./hero";
import { LogoCloud } from "./logo-cloud";
import { VSLSection } from "./vsl-section";
import { ProblemSection } from "./problem-section";
import { InteractiveDemo } from "./interactive-demo";
import { RewardsDemo } from "./rewards-demo";
import { FeatureShowcase } from "./feature-showcase";
import { AnalyticsDemo } from "./analytics-demo";
import { HowItWorks } from "./how-it-works";
import { BeforeAfter } from "./before-after";
import { SocialProof } from "./social-proof";
import { CaseStudy } from "./case-study";
import { TeamSection } from "./team-section";
import { PricingSection } from "./pricing-section";
import { AgencyWaitlist } from "./agency-waitlist";
import { FAQ } from "./faq";
import { FinalCTA } from "./final-cta";
import { Footer } from "./footer";

/**
 * Atlas Engine marketing landing page — CP-100.
 *
 * Conversion flow (top → bottom):
 *   Hero (promise + phone rebranding itself) → trust strip → VSL →
 *   problem (chains have apps) → interactive brand demo → engagement
 *   mechanics you can touch → feature vignettes → Impact dashboard →
 *   how it works → before/after → results + testimonials → case study →
 *   pricing + Founding Program → agency waitlist → FAQ → final CTA.
 *
 * One primary objective everywhere: "Book a free demo" (DemoCta).
 */
export function LandingPage({ fontClassName = "" }: { fontClassName?: string }) {
  return (
    <LandingProviders fontClassName={fontClassName}>
      <div className={`lp-root ${fontClassName} min-h-screen bg-[#fbf8f2] text-[#14213d] antialiased`}>
        <Navbar />
        <main id="main">
          <Hero />
          <LogoCloud />
          <VSLSection />
          <ProblemSection />
          <InteractiveDemo />
          <RewardsDemo />
          <FeatureShowcase />
          <AnalyticsDemo />
          <HowItWorks />
          <BeforeAfter />
          <SocialProof />
          <CaseStudy />
          <TeamSection />
          <PricingSection />
          <AgencyWaitlist />
          <FAQ />
          <FinalCTA />
        </main>
        <Footer />
      </div>
    </LandingProviders>
  );
}
