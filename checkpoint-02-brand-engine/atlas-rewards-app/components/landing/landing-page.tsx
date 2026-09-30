import { LandingProviders } from "./landing-providers";
import { Navbar } from "./navbar";
import { Hero } from "./hero";
import { VenueGallery } from "./venue-gallery";
import { LiveDemoSection } from "./live-demo-section";
import { Testimonials } from "./testimonials";
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
 * CP-176: "alive" pass — photo hero, venue photo marquee (was icon chips),
 * a tap-through copy of Flippo's real app (was static AppPicker), photo
 * feature cards, install-day photo, video testimonials, and the booking
 * modal lets visitors build their own app while they pick a time.
 *
 * Retired from the page (files kept for reference): NicheStrip, AppPicker, ProblemSection,
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
          <VenueGallery />
          <LiveDemoSection />
          <Features />
          <HowItWorks />
          <VSLSection />
          <CaseStudy />
          <Testimonials />
          <PricingSection />
          <FAQ />
          <FinalCTA />
        </main>
        <Footer />
      </div>
    </LandingProviders>
  );
}
