"use client";

import { useEffect, useState } from "react";

const faqItems = [
  {
    q: "Which boards are supported?",
    a: "VoiceUstad is fully aligned with the KPK Board FSc (Part 1 & Part 2) curriculum. Punjab Board and Federal Board support is in development and coming in Q2 2025.",
  },
  {
    q: "Is the Urdu explanation real spoken audio or robot TTS?",
    a: "Real, natural-sounding Urdu audio — not robotic text-to-speech. You get an English text explanation alongside a clear Urdu voice-over. You can read and listen at the same time.",
  },
  {
    q: "How do I pay? EasyPaisa / JazzCash?",
    a: "Yes — EasyPaisa, JazzCash, and direct bank transfer all accepted. No international credit card needed. Full payment instructions appear right after you create your free account.",
  },
  {
    q: "Can I use VoiceUstad on my Android phone?",
    a: "Absolutely. It runs in your browser — no app download needed. Works on Android, iPhone, and desktop. A native Android app is coming in Q4 2025.",
  },
  {
    q: "Can I ask questions in Urdu?",
    a: "Yes — Roman Urdu, Nastaliq Urdu, English, or a mix. Type however you naturally communicate and VoiceUstad will understand.",
  },
  {
    q: "What happens after the free week?",
    a: "After your 7-day free trial, it's Rs. 499/month. Cancel anytime — no lock-in, no questions asked. You keep full access until the end of your billing period.",
  },
];

export default function Home() {
  const [mobOpen, setMobOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [email, setEmail] = useState("");
  const [wlMsg, setWlMsg] = useState("No spam. Unsubscribe anytime.");
  const [wlMsgColor, setWlMsgColor] = useState<string | undefined>(undefined);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobOpen]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.09 }
    );
    const els = Array.from(document.querySelectorAll(".rv"));
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const toggleFaq = (index: number) => {
    setOpenFaq((prev) => (prev === index ? null : index));
  };

  const joinWaitlist = () => {
    const v = email.trim();
    if (v && v.includes("@")) {
      setWlMsg("✅ You're on the list! We'll notify you first.");
      setWlMsgColor("#34d399");
      setEmail("");
    } else {
      setWlMsg("Please enter a valid email address.");
      setWlMsgColor("#f87171");
    }
  };

  return (
    <>
      <div className="bg"></div>

      <div className="market-bar">
        🎉 Limited Launch Offer: <strong>First 7 Days Free</strong> · EasyPaisa &amp; JazzCash accepted
      </div>

      <nav id="nav" className={isScrolled ? "scrolled" : ""}>
        <a className="nav-brand" href="#">
          <span className="brand-emoji">📚</span> VoiceUstad
        </a>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#compare">Compare</a>
          <a href="#how">How It Works</a>
          <a href="#reviews">Reviews</a>
          <a href="#faq">FAQ</a>
          <a href="#pricing">Pricing</a>
        </div>
        <a href="/chat" className="nav-cta">Try 7 Days Free →</a>
        <button className="hbg" type="button" onClick={() => setMobOpen(true)} aria-label="Open menu">
          <span></span><span></span><span></span>
        </button>
      </nav>

      <div className={`mob${mobOpen ? " open" : ""}`} id="mob">
        <button className="mob-close" type="button" onClick={() => setMobOpen(false)} aria-label="Close menu">✕</button>
        <a href="#features" onClick={() => setMobOpen(false)}>Features</a>
        <a href="#compare" onClick={() => setMobOpen(false)}>Compare</a>
        <a href="#how" onClick={() => setMobOpen(false)}>How It Works</a>
        <a href="#reviews" onClick={() => setMobOpen(false)}>Reviews</a>
        <a href="#faq" onClick={() => setMobOpen(false)}>FAQ</a>
        <a href="#pricing" onClick={() => setMobOpen(false)}>Pricing</a>
        <a href="/chat" className="mob-cta" onClick={() => setMobOpen(false)}>→ Try 7 Days Free</a>
      </div>

      <section className="hero">
        <span className="urdu-tag">آپ کا ڈیجیٹل استاد</span>

        <div className="live-pill">
          <span className="pulse"></span>
          Live Now · KPK Board FSc Students
        </div>

        <span className="hero-glyph">📚</span>

        <h1>
          <span className="g">VoiceUstad</span><br />
          <span style={{ color: "rgba(255,255,255,.82)", fontSize: ".65em", letterSpacing: "-1.5px" }}>AI Chemistry Tutor</span>
        </h1>

        <p className="hero-sub" style={{ marginTop: "16px" }}>
          Learn FSc Chemistry with <strong>English text</strong> &amp;
          <strong>Urdu voice explanations</strong> — crafted for Pakistani students, aligned to KPK Board
        </p>

        <div className="mockup-wrap rv">
          <div className="phone-chrome">
            <div className="phone-top">
              <div className="phone-dots">
                <span className="pd-r"></span>
                <span className="pd-y"></span>
                <span className="pd-g"></span>
              </div>
              <div className="phone-title">VOICEUSTAD CHAT</div>
              <div style={{ fontSize: ".65rem", color: "var(--green)", fontWeight: "700" }}>● LIVE</div>
            </div>
            <div className="phone-body">
              <div className="bubble-row right">
                <div className="bbl bbl-s">Electronegativity kya hoti hai? 😕</div>
                <div className="bbl-av">👨‍🎓</div>
              </div>
              <div className="bubble-row">
                <div className="bbl-av">🤖</div>
                <div className="bbl bbl-a">Electronegativity ek atom ki woh khasiyat hai jis se woh electrons ko apni taraf kheenchta hai. Pauling scale pe fluorine (4.0) sab se zyada electronegative hai! ⚡</div>
              </div>
              <div className="voice-row">
                <div className="voice-wave">
                  <span></span><span></span><span></span><span></span><span></span>
                </div>
                🔊 Urdu explanation playing...
              </div>
              <div className="bubble-row">
                <div className="bbl-av">🤖</div>
                <div className="bbl bbl-a">
                  <div className="typing-dots"><span></span><span></span><span></span></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="hero-cta rv d1">
          <div className="urgency">🔥 First week completely FREE — no card needed</div>
          <a href="/chat" className="btn-cta">
            Try 7 Days Free
            <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
          <p className="cta-micro">No credit card · EasyPaisa / JazzCash accepted · Cancel anytime</p>
        </div>
      </section>

      <div className="market-banner rv">
        <div className="mb-item"><span className="mb-val">2.8M+</span> FSc students in Pakistan</div>
        <div className="mb-item"><span className="mb-val">⭐ 4.9</span> avg student rating</div>
        <div className="mb-item"><span className="mb-val">487</span> active students</div>
        <div className="mb-item"><span className="mb-val">24+</span> FSc chapters covered</div>
        <div className="mb-item"><span className="mb-val">Rs. 80B</span> tutoring market</div>
      </div>

      <div className="divider"></div>

      <section id="features" className="feat-sec">
        <div className="sh rv">
          <div className="sh-eye">What You Get</div>
          <div className="sh-title">Everything You Need to Ace Chemistry</div>
          <p className="sh-sub">One subscription covers your entire FSc journey — both years, every chapter.</p>
        </div>
        <div className="feat-grid">
          <div className="fc rv d1"><span className="fc-icon">🧪</span><h4>Full FSc Syllabus</h4><p>Part 1 &amp; Part 2 — atomic structure, bonding, thermodynamics, organic chemistry &amp; more, chapter by chapter.</p></div>
          <div className="fc rv d2"><span className="fc-icon">🔊</span><h4>Real Urdu Voice</h4><p>Natural spoken Urdu audio — not robotic TTS. Hear it explained the way a real ustad would.</p></div>
          <div className="fc rv d3"><span className="fc-icon">📚</span><h4>KPK Board Aligned</h4><p>100% matched to KPK curriculum with exam tips, marking schemes &amp; board paper patterns.</p></div>
          <div className="fc rv d1"><span className="fc-icon">🤖</span><h4>Ask in Urdu or English</h4><p>Type naturally in Roman Urdu, Nastaliq, or English. VoiceUstad understands and answers like a patient teacher.</p></div>
          <div className="fc rv d2"><span className="fc-icon">📝</span><h4>Past Paper Walkthroughs</h4><p>Step-by-step AI guidance on KPK Board past papers with instant feedback on every answer.</p></div>
          <div className="fc rv d3"><span className="fc-icon">⚡</span><h4>Always Available</h4><p>Study at 2am the night before your exam — no appointment, no waiting, no missed sessions.</p></div>
        </div>
      </section>

      <div className="opp-strip rv">
        <div className="opp-inner">
          <div className="opp-left">
            <h3>A massive, underserved market<br />in Pakistan's education sector</h3>
            <p>Over 2.8 million students sit FSc exams each year. Most rely on expensive private tutors or free YouTube videos with no guidance. VoiceUstad bridges that gap at a price every family can afford.</p>
          </div>
          <div className="opp-stats">
            <div className="opp-stat">
              <div className="opp-num">2.8M+</div>
              <div className="opp-label">FSc students per year in Pakistan</div>
            </div>
            <div className="opp-stat">
              <div className="opp-num">Rs. 80B</div>
              <div className="opp-label">Pakistan private tutoring market size</div>
            </div>
            <div className="opp-stat">
              <div className="opp-num">8×</div>
              <div className="opp-label">cheaper than a private tutor</div>
            </div>
          </div>
        </div>
      </div>

      <div className="divider"></div>

      <section id="compare" className="comp-sec">
        <div className="sh rv">
          <div className="sh-eye">The Smarter Choice</div>
          <div className="sh-title">VoiceUstad vs Traditional Tutoring</div>
        </div>
        <div className="comp-grid rv">
          <div className="cc cc-old">
            <h4>😞 Traditional Tutor</h4>
            <ul>
              <li><span className="ic">❌</span> Rs. 3,000 — 8,000 per month</li>
              <li><span className="ic">❌</span> Fixed schedule — miss a class, lose the lesson</li>
              <li><span className="ic">❌</span> Can't replay or re-listen to explanations</li>
              <li><span className="ic">❌</span> One topic per session only</li>
              <li><span className="ic">❌</span> No structured past-paper support</li>
              <li><span className="ic">❌</span> Travel time &amp; transport cost</li>
            </ul>
          </div>
          <div className="cc cc-new">
            <h4>📚 VoiceUstad AI</h4>
            <ul>
              <li><span className="ic">✅</span> Only <strong>Rs. 499/month</strong> — unlimited</li>
              <li><span className="ic">✅</span> Study any time — 2am or 2pm</li>
              <li><span className="ic">✅</span> Replay Urdu explanations unlimited times</li>
              <li><span className="ic">✅</span> Cover multiple chapters in one session</li>
              <li><span className="ic">✅</span> Full KPK past paper walkthroughs included</li>
              <li><span className="ic">✅</span> Zero travel — study from home, anywhere</li>
            </ul>
          </div>
        </div>
      </section>

      <div className="divider"></div>

      <section id="how" className="how-sec">
        <div className="sh rv">
          <div className="sh-eye">Getting Started</div>
          <div className="sh-title">Up and Learning in 3 Steps</div>
        </div>
        <div className="steps">
          <div className="sc rv d1">
            <div className="sc-num">01</div>
            <div className="sc-icon">✍️</div>
            <h4>Sign Up</h4>
            <p>Create your free account in 60 seconds — no credit card needed</p>
          </div>
          <div className="arrow-conn rv"><div className="arrow-line"></div><div className="arrow-head">▶</div></div>
          <div className="sc rv d2">
            <div className="sc-num">02</div>
            <div className="sc-icon">📖</div>
            <h4>Pick a Topic</h4>
            <p>Choose any FSc chapter or just type your chemistry question</p>
          </div>
          <div className="arrow-conn rv"><div className="arrow-line"></div><div className="arrow-head">▶</div></div>
          <div className="sc rv d3">
            <div className="sc-num">03</div>
            <div className="sc-icon">🎧</div>
            <h4>Learn &amp; Listen</h4>
            <p>English explanation + Urdu voice audio, instantly, 24/7</p>
          </div>
        </div>
      </section>

      <div className="divider"></div>

      <section id="reviews" className="test-sec">
        <div className="sh rv">
          <div className="sh-eye">Student Reviews</div>
          <div className="sh-title">Real Results from Real Students</div>
          <p className="sh-sub">Verified reviews from KPK Board FSc students across Pakistan.</p>
        </div>
        <div className="test-grid">
          <div className="tc rv d1">
            <div className="tc-stars">⭐⭐⭐⭐⭐</div>
            <p className="tc-quote">"Pehlay chemistry mein bohot mushkil hoti thi. VoiceUstad ki Urdu explanations ne sab clear kar diya. Board exam mein A grade aaya — bilkul expect nahi tha!"</p>
            <div className="tc-author">
              <div className="tc-av">👦</div>
              <div><div className="tc-name">Ahmed Raza</div><div className="tc-meta">FSc Part 2 · Peshawar · Grade A</div></div>
            </div>
          </div>
          <div className="tc rv d2">
            <div className="tc-stars">⭐⭐⭐⭐⭐</div>
            <p className="tc-quote">"My daughter struggled with organic chemistry for months. Two weeks on VoiceUstad and she was explaining reactions to me. Worth every single rupee."</p>
            <div className="tc-author">
              <div className="tc-av">👩</div>
              <div><div className="tc-name">Fatima's Father</div><div className="tc-meta">Parent · Mardan</div></div>
            </div>
          </div>
          <div className="tc rv d3">
            <div className="tc-stars">⭐⭐⭐⭐⭐</div>
            <p className="tc-quote">"Rs. 499 mein itna zyada content! Main raat 12 baje bhi padh sakta hoon. Kisi private tutor ki zaroorat nahi rahi — yeh ustad 24/7 available hai."</p>
            <div className="tc-author">
              <div className="tc-av">🧑</div>
              <div><div className="tc-name">Bilal Khan</div><div className="tc-meta">FSc Part 1 · Abbottabad</div></div>
            </div>
          </div>
        </div>
      </section>

      <div className="divider"></div>

      <div className="road-sec rv">
        <div className="road-inner">
          <div className="road-head">
            <div className="sh-eye">Product Roadmap</div>
            <div className="sh-title" style={{ fontSize: "1.7rem" }}>Where We're Going</div>
            <p className="sh-sub">VoiceUstad is just getting started. Here's what's coming.</p>
          </div>
          <div className="road-grid">
            <div className="road-item live">
              <span className="road-badge badge-live">Live Now</span>
              <span className="road-icon">🧪</span>
              <h4>KPK Board Chemistry</h4>
              <p>FSc Part 1 &amp; Part 2, full syllabus</p>
            </div>
            <div className="road-item soon">
              <span className="road-badge badge-soon">Q2 2025</span>
              <span className="road-icon">📱</span>
              <h4>Punjab &amp; Federal Board</h4>
              <p>Expanding to 2 more boards</p>
            </div>
            <div className="road-item soon">
              <span className="road-badge badge-soon">Q3 2025</span>
              <span className="road-icon">⚡</span>
              <h4>Biology &amp; Physics</h4>
              <p>Full FSc science subject coverage</p>
            </div>
            <div className="road-item soon">
              <span className="road-badge badge-soon">Q4 2025</span>
              <span className="road-icon">📱</span>
              <h4>Mobile App</h4>
              <p>Native Android app, offline mode</p>
            </div>
          </div>
        </div>
      </div>

      <div className="divider"></div>

      <section id="faq" className="faq-sec">
        <div className="sh rv">
          <div className="sh-eye">Common Questions</div>
          <div className="sh-title">Frequently Asked Questions</div>
        </div>
        <div className="faq-wrap">
          {faqItems.map((item, index) => (
            <div className={`fi${openFaq === index ? " open" : ""}`} key={item.q}>
              <button className="fq" type="button" onClick={() => toggleFaq(index)}>
                {item.q}
                <span className="fi-icon">+</span>
              </button>
              <div className="fa">{item.a}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="divider"></div>

      <section id="pricing" className="price-sec">
        <div className="sh rv">
          <div className="sh-eye">Pricing</div>
          <div className="sh-title">One Plan. Everything Included.</div>
        </div>
        <div className="price-wrap">
          <div className="vc rv">
            <h4>💡 What you'd pay elsewhere</h4>
            <div className="vr"><span className="vl">Private tutor<br /><small style={{ opacity: ".55" }}>4 sessions/month</small></span><span className="vp x">Rs. 4,000+</span></div>
            <div className="vr"><span className="vl">Coaching academy<br /><small style={{ opacity: ".55" }}>monthly</small></span><span className="vp x">Rs. 2,500+</span></div>
            <div className="vr"><span className="vl">YouTube + textbooks<br /><small style={{ opacity: ".55" }}>no personalised help</small></span><span className="vp" style={{ color: "rgba(255,255,255,.25)", fontWeight: "400" }}>Free but unguided</span></div>
            <div className="vr" style={{ marginTop: "8px", background: "rgba(52,211,153,0.06)", borderRadius: "12px", padding: "12px 14px", border: "none" }}>
              <span className="vl" style={{ color: "#fff", fontWeight: "700" }}>VoiceUstad<br /><small style={{ color: "var(--green)", opacity: "1", fontWeight: "600" }}>unlimited · AI-powered · 24/7</small></span>
              <span className="vp win">Rs. 499/mo</span>
            </div>
          </div>
          <div className="pc rv d1">
            <div className="best-tag">Best Value</div>
            <div className="pp">Rs. 499</div>
            <div className="pp-sub">per month · unlimited access</div>
            <ul className="pf">
              <li><span className="chk">✅</span> Full KPK Board FSc Part 1 &amp; Part 2</li>
              <li><span className="chk">✅</span> English text + natural Urdu voice audio</li>
              <li><span className="chk">✅</span> Ask unlimited questions, any chapter</li>
              <li><span className="chk">✅</span> 24/7 access on any device</li>
              <li><span className="chk">✅</span> Past paper walkthroughs with AI feedback</li>
              <li><span className="chk">✅</span> EasyPaisa / JazzCash / bank transfer</li>
              <li><span className="chk">✅</span> Cancel anytime — zero lock-in</li>
            </ul>
            <a href="/chat" className="btn-pay">Try 7 Days Free → Then Rs. 499/mo</a>
            <p className="pay-note">First 7 days completely free · No credit card required</p>
          </div>
        </div>
      </section>

      <div className="waitlist-sec rv">
        <h3>Not ready yet? Stay in the loop.</h3>
        <p>Get notified when Punjab Board support, Biology, and the mobile app launch.</p>
        <div className="email-form">
          <input
            type="email"
            placeholder="your@email.com"
            id="wl-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="button" onClick={joinWaitlist}>Notify Me</button>
        </div>
        <p className="wl-note" id="wl-msg" style={{ color: wlMsgColor }}>{wlMsg}</p>
      </div>

      <div className="final">
        <h2>Ready to ace your <span className="g">Chemistry exam?</span></h2>
        <p>Join 487 KPK Board students already learning smarter with VoiceUstad. Your first week is free.</p>
        <a href="/chat" className="btn-cta" style={{ fontSize: "1.05rem", padding: "17px 48px" }}>
          Try 7 Days Free
          <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </a>
        <p className="cta-micro" style={{ marginTop: "14px" }}>No credit card · EasyPaisa &amp; JazzCash · Cancel anytime</p>
      </div>

      <footer>
        <div className="fg">
          <div>
            <div className="fbr">📚 VoiceUstad</div>
            <p className="ft">Pakistan's AI-powered FSc Chemistry tutor. English text, Urdu voice, KPK Board aligned.</p>
            <p style={{ marginTop: "14px", fontSize: ".76rem", color: "rgba(160,120,255,0.45)" }}>Made with ❤️ in Peshawar, Pakistan 🇵🇰</p>
          </div>
          <div className="fc-col">
            <h5>Product</h5>
            <a href="#features">Features</a>
            <a href="#compare">Compare</a>
            <a href="#pricing">Pricing</a>
            <a href="/chat">Start Free Trial</a>
          </div>
          <div className="fc-col">
            <h5>Support</h5>
            <a href="#faq">FAQ</a>
            <a href="mailto:support@voiceustad.pk">support@voiceustad.pk</a>
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
          </div>
        </div>
        <div className="fb">
          <span>© 2026 VoiceUstad · All rights reserved</span>
          <span>آپ کا ڈیجیٹل استاد</span>
        </div>
      </footer>
    </>
  );
}
