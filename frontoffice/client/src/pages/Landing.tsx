import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { TerangaSymbol } from '../components/Logo'
import { SUBSCRIPTIONS_ENABLED } from '../config'
import styles from './Landing.module.css'

// ——— NAV ———
function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Ferme le menu si on repasse en vue « desktop » (≥ 900 px) ou sur Échap.
  useEffect(() => {
    if (!menuOpen) return
    const onResize = () => { if (window.innerWidth > 900) setMenuOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const close = () => setMenuOpen(false)

  // Liens partagés entre la barre desktop et le panneau mobile.
  const links = (
    <>
      <a href="#unions" onClick={close}>Unions</a>
      <a href="#comment" onClick={close}>Comment ça marche</a>
      <a href="#valeurs" onClick={close}>Nos valeurs</a>
      {SUBSCRIPTIONS_ENABLED && <a href="#tarifs" onClick={close}>Abonnement</a>}
      <Link to="/connexion" className="btn btn-ghost" style={{ padding: '10px 20px', fontSize: 14 }} onClick={close}>Se connecter</Link>
      <Link to="/inscription" className="btn btn-primary" style={{ padding: '10px 20px', fontSize: 14 }} onClick={close}>Commencer</Link>
    </>
  )

  return (
    <nav className={`${styles.nav} ${scrolled || menuOpen ? styles.navScrolled : ''}`}>
      <a href="#" className={styles.navLogo} onClick={close}>
        <TerangaSymbol size={40} />
        <span className={styles.navLogoText}>Tér<em>anga</em></span>
      </a>

      {/* Barre horizontale (desktop) */}
      <div className={styles.navLinks}>{links}</div>

      {/* Bouton hamburger (tablette / smartphone) */}
      <button
        type="button"
        className={`${styles.hamburger} ${menuOpen ? styles.hamburgerOpen : ''}`}
        aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        aria-expanded={menuOpen}
        aria-controls="menu-mobile"
        onClick={() => setMenuOpen(o => !o)}
      >
        <span /><span /><span />
      </button>

      {/* Panneau déroulant (tablette / smartphone) */}
      <div
        id="menu-mobile"
        className={`${styles.mobileMenu} ${menuOpen ? styles.mobileMenuOpen : ''}`}
      >
        {links}
      </div>
    </nav>
  )
}

// ——— FAQ ITEM ———
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`${styles.faqItem} ${open ? styles.faqOpen : ''}`} onClick={() => setOpen(o => !o)}>
      <div className={styles.faqQ}>{q}</div>
      <div className={styles.faqA}>{a}</div>
    </div>
  )
}

// ——— REVEAL HOOK ———
function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true) }, { threshold: 0.12 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const { ref, visible } = useReveal()
  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(30px)',
        transition: `opacity 0.8s ease ${delay}s, transform 0.8s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  )
}

// ——— MAIN PAGE ———
export default function Landing() {
  const [emailInput, setEmailInput] = useState('')
  const [emailSent, setEmailSent] = useState(false)

  function submitEmail() {
    if (emailInput.length > 3) { setEmailSent(true); setEmailInput('') }
  }

  return (
    <div className={styles.page}>
      <Nav />

      {/* ====== HERO ====== */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div>
            <div className={`eyebrow ${styles.heroEyebrow} ${styles.reveal1}`}>Rencontres pour le mariage</div>
            <h1 className={`${styles.heroTitle} ${styles.reveal2}`}>
              Rencontrez <em>la personne</em><br />avec qui tout <em>commence.</em>
            </h1>
            <p className={`${styles.heroLead} ${styles.reveal3}`}>
              Téranga réunit des femmes et des hommes prêts à s'engager, à fonder
              un foyer, à bâtir une vie à deux. Pas de jeu. Pas d'ambiguïté.
              Seulement des rencontres qui comptent.
            </p>
            <div className={`${styles.heroCta} ${styles.reveal4}`}>
              <Link to="/inscription" className="btn btn-primary" style={{ fontSize: 16, padding: '14px 32px' }}>Créer mon profil</Link>
              <a href="#unions" className="btn btn-ghost" style={{ fontSize: 16, padding: '14px 32px' }}>Voir des histoires</a>
            </div>
            <p className={`${styles.heroSub} ${styles.reveal4}`}>
              Déjà plus de 1 200 bêta-testeurs inscrits à Dakar, Abidjan et Douala.
            </p>
          </div>

          <div className={styles.heroVisual}>
            {/* Card Her */}
            <div className={`${styles.meetingCard} ${styles.cardHer}`}>
              <div className={styles.mcPhoto}>
                <span className={styles.mcVerified}>Vérifié</span>
                <img src="https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=600&q=80&auto=format&fit=crop" alt="Aminata" loading="lazy" />
              </div>
              <div className={styles.mcInfo}>
                <span className={styles.mcTag}>Mariage</span>
                <div className={styles.mcName}>Aminata, 29</div>
                <div className={styles.mcMeta}>Dakar · Enseignante</div>
              </div>
            </div>

            {/* Heart connector */}
            <div className={styles.heartConnector}>
              <TerangaSymbol size={60} />
            </div>
            <div className={styles.meetingLabel}>la rencontre</div>

            {/* Card Him */}
            <div className={`${styles.meetingCard} ${styles.cardHim}`}>
              <div className={styles.mcPhoto}>
                <span className={styles.mcVerified}>Vérifié</span>
                <img src="https://images.unsplash.com/photo-1507152832244-10d45c7eda57?w=600&q=80&auto=format&fit=crop" alt="Ibrahim" loading="lazy" />
              </div>
              <div className={styles.mcInfo}>
                <span className={styles.mcTag}>Mariage</span>
                <div className={styles.mcName}>Ibrahim, 33</div>
                <div className={styles.mcMeta}>Dakar · Ingénieur</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====== UNIONS ====== */}
      <section className={styles.unions} id="unions">
        <div className={styles.unionsInner}>
          <Reveal>
            <div className={styles.unionsHead}>
              <div className={`eyebrow ${styles.unionsEyebrow}`}>Nos unions</div>
              <div className={styles.unionCounter}>47</div>
              <p className={styles.unionCounterLabel}>
                couples se sont dit oui depuis le lancement de la bêta.<br />
                Voici quelques-unes de leurs histoires.
              </p>
            </div>
          </Reveal>

          <div className={styles.storiesGrid}>
            {[
              {
                badge: 'Mariés — Mars 2026',
                img: 'https://images.unsplash.com/photo-1609234656388-0ff363383899?w=700&q=80&auto=format&fit=crop',
                alt: 'Mariama et Oumar',
                quote: '« Nous nous sommes parlé pendant trois mois avant de nous voir. Quand il a rencontré mes parents, j\'ai su que c\'était lui. »',
                author: 'Mariama & Oumar',
                city: 'Dakar',
              },
              {
                badge: 'Fiancés — Janvier 2026',
                img: 'https://images.unsplash.com/photo-1621184455862-c163dfb30e0f?w=700&q=80&auto=format&fit=crop',
                alt: 'Fatou et Jean-Paul',
                quote: '« J\'avais presque abandonné l\'idée de me remarier. Téranga m\'a fait rencontrer un homme qui respecte ma fille autant que moi. »',
                author: 'Fatou & Jean-Paul',
                city: 'Abidjan',
              },
              {
                badge: 'Attendent un enfant',
                img: 'https://images.unsplash.com/photo-1529636798458-92182e662485?w=700&q=80&auto=format&fit=crop',
                alt: 'Clarisse et Aurélien',
                quote: '« Dès le premier message, on a compris qu\'on cherchait la même chose. Le mariage, une famille, une vie stable. »',
                author: 'Clarisse & Aurélien',
                city: 'Douala',
              },
            ].map((s, i) => (
              <Reveal key={i} delay={i * 0.15}>
                <div className={styles.story}>
                  <div className={styles.storyPhoto}>
                    <span className={styles.storyBadge}>{s.badge}</span>
                    <img src={s.img} alt={s.alt} loading="lazy" />
                  </div>
                  <div className={styles.storyContent}>
                    <p className={styles.storyText}>{s.quote}</p>
                    <div className={styles.storyAuthor}><strong>{s.author}</strong> — {s.city}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ====== PARCOURS ====== */}
      <section className={styles.section} id="comment">
        <div className={styles.sectionHead}>
          <Reveal><div className="eyebrow">Le parcours</div></Reveal>
          <Reveal delay={0.1}>
            <h2 className={styles.sectionTitle}>Quatre étapes, <em>un même horizon.</em></h2>
          </Reveal>
        </div>
        <div className={styles.journeyGrid}>
          {[
            { n: 'i', title: 'Vous créez votre profil', body: 'Quelques photos, votre ville, votre intention. Vérification biométrique pour garantir votre identité.' },
            { n: 'ii', title: 'Vous rencontrez quelqu\'un', body: 'Parcourez des profils de personnes qui partagent votre objectif de vie. Un like mutuel ouvre la conversation.' },
            { n: 'iii', title: 'Vous apprenez à vous connaître', body: 'Échangez en toute sécurité. Participez aux événements visio ou en présentiel dans votre ville.' },
            { n: 'iv', title: 'Vous construisez ensemble', body: 'Quand le moment est venu, présentez vos familles. Téranga accompagne votre histoire jusqu\'à son début.' },
          ].map((step, i) => (
            <Reveal key={i} delay={i * 0.1}>
              <div className={styles.journeyStep}>
                <div className={styles.journeyNumber}>{step.n}</div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ====== VALEURS ====== */}
      <section className={styles.values} id="valeurs">
        <div className={styles.valuesInner}>
          <div className={styles.sectionHead}>
            <Reveal><div className={`eyebrow ${styles.eyebrowLight}`}>Nos valeurs</div></Reveal>
            <Reveal delay={0.1}>
              <h2 className={`${styles.sectionTitle} ${styles.sectionTitleLight}`}>
                Le respect des <em>traditions</em>,<br />l'exigence de la <em>modernité.</em>
              </h2>
            </Reveal>
          </div>
          <div className={styles.valuesGrid}>
            {[
              { icon: 'i.', title: 'L\'intention avant tout', body: 'Chaque profil déclare clairement ce qu\'il cherche : relation sérieuse, mariage, fonder une famille. Ici, on ne joue pas.' },
              { icon: 'ii.', title: 'La famille au cœur', body: 'Un tiers de confiance — frère, sœur, ami — peut valider le profil de l\'autre personne avant une rencontre en présentiel.' },
              { icon: 'iii.', title: 'Le respect mutuel', body: 'Tolérance zéro pour le harcèlement. Modération humaine francophone. Tout abus entraîne un bannissement définitif.' },
              { icon: 'iv.', title: 'La sincérité des profils', body: 'Vérification biométrique obligatoire. Protection anti-brouteur renforcée. Vous parlez à de vraies personnes, sérieusement.' },
            ].map((v, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div className={styles.value}>
                  <div className={styles.valueIcon}>{v.icon}</div>
                  <div>
                    <h3>{v.title}</h3>
                    <p>{v.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ====== MOMENT ====== */}
      <section className={styles.moment}>
        <Reveal>
          <div className={styles.momentContent}>
            <div className="eyebrow" style={{ marginBottom: 24 }}>Une conversation, un début</div>
            <h2 className={styles.momentTitle}>Et si le premier <em>« bonjour »</em><br />était le vrai ?</h2>
            <p>Derrière chaque profil, une personne qui a pris le temps de se présenter, de déclarer son intention, de prouver son identité.</p>
            <p>Pas de messages à la chaîne. Pas de photos envoyées sans réfléchir. Seulement des échanges qui peuvent, un jour, mener quelque part.</p>
          </div>
        </Reveal>
        <Reveal delay={0.2}>
          <div className={styles.momentVisual}>
            <div className={styles.momentPhoto}>
              <img src="https://images.unsplash.com/photo-1542596594-649edbc13630?w=900&q=80&auto=format&fit=crop" alt="Un couple heureux" loading="lazy" />
            </div>
            <div className={styles.phoneFrame}>
              <div className={styles.phoneScreen}>
                <div className={styles.phoneNotch} />
                <div className={styles.phoneStatusbar}>
                  <TerangaSymbol size={20} />
                  <span>Tér<em>anga</em></span>
                </div>
                <div className={styles.chatHeader}>
                  <div className={styles.chAvatar}>
                    <img src="https://images.unsplash.com/photo-1507152832244-10d45c7eda57?w=100&q=80&auto=format&fit=crop" alt="Ibrahim" />
                  </div>
                  <div>
                    <div className={styles.chName}>Ibrahim, 33</div>
                    <div className={styles.chMeta}>✓ Vérifié · Dakar</div>
                  </div>
                </div>
                <div className={styles.chatBody}>
                  <div className={styles.chatMsg}>Bonjour Aminata, votre profil m'a beaucoup touché.</div>
                  <div className={styles.chatMsg}>Vous êtes enseignante ? Dans quel domaine ?</div>
                  <div className={`${styles.chatMsg} ${styles.mine}`}>Bonjour Ibrahim ! J'enseigne les mathématiques au lycée.</div>
                  <div className={`${styles.chatMsg} ${styles.mine}`}>Et vous, ingénieur dans quelle spécialité ?</div>
                  <div className={styles.chatMsg}>Télécoms. J'ai cofondé une petite entreprise.</div>
                  <div className={styles.chatMsg}>Ma mère voudrait vous rencontrer 🙂</div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ====== TARIFS ====== */}
      {/* Masquée en version 1 : le modèle freemium est désactivé. */}
      {SUBSCRIPTIONS_ENABLED && (
      <section className={styles.pricing} id="tarifs">
        <div className={styles.pricingInner}>
          <Reveal>
            <div className={`eyebrow ${styles.pricingEyebrow}`}>Pour les hommes</div>
            <h2 className={styles.pricingTitle}>Un engagement, <em>symbolique et concret.</em></h2>
            <p className={styles.pricingLead}>
              Pour préserver un équilibre entre femmes et hommes, et s'assurer
              que chaque profil masculin est réellement engagé dans sa démarche,
              l'accès à la messagerie est réservé aux hommes abonnés. Les femmes,
              elles, bénéficient de l'intégralité des fonctionnalités sans frais.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className={styles.pricingTable}>
              <div className={styles.priceCol}>
                <div className={styles.priceName}>Découverte</div>
                <div className={styles.priceAmount}>1 000 <small>F / mois</small></div>
                <div className={styles.priceDetails}>1 mois — 1 000 F CFA</div>
                <div className={styles.priceNote}>Messagerie et découverte illimitées</div>
              </div>
              <div className={`${styles.priceCol} ${styles.priceFeatured}`}>
                <div className={styles.priceName}>Standard</div>
                <div className={styles.priceAmount}>500 <small>F / mois</small></div>
                <div className={styles.priceDetails}>3 mois — 1 500 F CFA</div>
                <div className={styles.priceNote}>Tout Découverte + événements</div>
              </div>
              <div className={styles.priceCol}>
                <div className={styles.priceName}>Engagement</div>
                <div className={styles.priceAmount}>833 <small>F / mois</small></div>
                <div className={styles.priceDetails}>6 mois — 5 000 F CFA</div>
                <div className={styles.priceNote}>Tout Standard + coach dédié</div>
              </div>
            </div>
            <p className={styles.pricingDisclaimer}>
              Paiement par <strong>Orange Money, Wave, MTN MoMo, Moov Money, carte bancaire</strong> ou facture opérateur. Annulable à tout moment à la fin de la période choisie.
            </p>
          </Reveal>
        </div>
      </section>

      )}

      {/* ====== FAQ ====== */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <Reveal><div className="eyebrow">Questions fréquentes</div></Reveal>
          <Reveal delay={0.1}><h2 className={styles.sectionTitle}>Tout ce que vous <em>voulez savoir.</em></h2></Reveal>
        </div>
        <div className={styles.faq}>
          {[
            { q: 'Téranga est-elle vraiment différente des autres apps ?', a: 'Oui. Ici, chaque profil déclare son intention : mariage, relation sérieuse, fonder une famille. Pas de rencontres d\'un soir, pas de photos inappropriées, pas de jeux. Seulement des personnes prêtes à construire quelque chose de durable.' },
            { q: 'Comment vous protégez contre les brouteurs ?', a: 'Vérification biométrique obligatoire à l\'inscription, géolocalisation croisée, détection automatique par IA des demandes d\'argent et des schémas d\'arnaque. Tout utilisateur identifié comme brouteur est banni définitivement, sans possibilité de recréer un compte.' },
            { q: 'Puis-je impliquer ma famille dans ma démarche ?', a: 'Absolument. Notre fonctionnalité « tiers de confiance » permet à un proche (frère, sœur, ami, parent) de consulter le profil de la personne avec qui vous échangez, et de valider avant une rencontre en présentiel. La famille a toute sa place ici.' },
            { q: 'L\'app fonctionne-t-elle en 3G ou en zone peu couverte ?', a: 'Oui. Téranga est optimisée pour les réseaux africains : images compressées, mode économie de données, cache offline. L\'app fonctionne même avec une connexion 2G intermittente.' },
            { q: 'Dans quels pays est disponible Téranga ?', a: 'Au lancement : Sénégal et Côte d\'Ivoire. Puis Cameroun, Mali, Burkina Faso, Togo, Bénin. Ensuite Maroc, Tunisie, Algérie et RDC. Téranga a vocation à couvrir toute l\'Afrique francophone et sa diaspora.' },
            { q: 'Mon profil est-il visible par tout le monde ?', a: 'Non. Vous choisissez votre visibilité. Le mode discrétion permet même de remplacer l\'icône de l\'app sur votre téléphone par une icône neutre, pour préserver votre vie privée vis-à-vis de votre entourage.' },
          ].map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} />
          ))}
        </div>
      </section>

      {/* ====== FINAL CTA ====== */}
      <section className={styles.finalCta} id="inscription">
        <div className={styles.finalCtaBg}>
          <img src="https://images.unsplash.com/photo-1591604466107-ec97de577aff?w=1600&q=80&auto=format&fit=crop" alt="Couple africain heureux" loading="lazy" />
        </div>
        <div className={styles.finalCtaInner}>
          <div className={styles.finalCtaLogo}><TerangaSymbol size={64} light /></div>
          <h2>Votre histoire <em>commence ici.</em></h2>
          <p>Rejoignez les premiers membres de Téranga et trouvez la personne avec qui bâtir votre vie.</p>
          <div className={styles.finalCtaBtns}>
            <Link to="/inscription" className="btn btn-primary" style={{ fontSize: 16, padding: '16px 36px', background: 'var(--ocre-deep)', boxShadow: '0 2px 0 var(--terra-deep)' }}>
              Créer mon profil gratuitement
            </Link>
            <Link to="/connexion" className="btn btn-ghost" style={{ fontSize: 16, padding: '16px 36px', color: 'var(--sand)', borderColor: 'rgba(245,230,211,0.4)' }}>
              J'ai déjà un compte
            </Link>
          </div>
          {emailSent && <p className={styles.emailConfirm}>✓ Merci — vous êtes sur la liste.</p>}
        </div>
      </section>

      {/* ====== FOOTER ====== */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div>
            <a href="#" className={styles.footerLogo}>
              <TerangaSymbol size={48} light />
              <div className={styles.footerLogoText}>
                Tér<em>anga</em>
                <span>La rencontre, autrement</span>
              </div>
            </a>
            <p className={styles.footerTagline}>Rencontres pour le mariage. Conçue pour l'Afrique francophone et sa diaspora.</p>
          </div>
          <div className={styles.footerCol}>
            <h4>Téranga</h4>
            <a href="#unions">Nos unions</a>
            <a href="#comment">Comment ça marche</a>
            <a href="#valeurs">Nos valeurs</a>
            {SUBSCRIPTIONS_ENABLED && <a href="#tarifs">Abonnement</a>}
          </div>
          <div className={styles.footerCol}>
            <h4>Entreprise</h4>
            <a href="#">À propos</a>
            <a href="#">Manifeste</a>
            <a href="#">Presse</a>
            <a href="#">Contact</a>
          </div>
          <div className={styles.footerCol}>
            <h4>Légal</h4>
            <a href="#">CGU</a>
            <a href="#">Confidentialité</a>
            <a href="#">Protection des données</a>
            <a href="#">Modération</a>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <div>© 2026 Téranga — Tous droits réservés.</div>
          <div>Fait avec cœur pour l'Afrique.</div>
        </div>
      </footer>
    </div>
  )
}
