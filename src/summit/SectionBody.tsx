import type { ContactLink, Education, ResumeEntry, ResumeSection, SkillGroup } from '../content/resume'

/** Date and place on one line; CSS draws the separator, so neither string carries one. */
function Meta({ when, where }: { when?: string; where?: string }) {
  if (!when && !where) return null
  return (
    <p className="glass-meta">
      {when && <span>{when}</span>}
      {where && <span>{where}</span>}
    </p>
  )
}

function Entry({ entry }: { entry: ResumeEntry }) {
  return (
    <li className="glass-entry">
      <div className="glass-entry-head">
        <h3 className="glass-entry-title">{entry.title}</h3>
        <Meta when={entry.when} where={entry.where} />
      </div>
      {entry.role && <p className="glass-role">{entry.role}</p>}
      {entry.placements && (
        <ul className="glass-badges">
          {entry.placements.map((placement, i) => (
            <li key={placement} className={i === 0 ? 'glass-badge glass-inset glass-badge--lead' : 'glass-badge glass-inset'}>
              {placement}
            </li>
          ))}
        </ul>
      )}
      <ul className="glass-bullets">
        {entry.bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
      {entry.link && (
        <a className="glass-link" href={entry.link.href} target="_blank" rel="noreferrer">
          {entry.link.label}
          <span aria-hidden="true">↗</span>
        </a>
      )}
    </li>
  )
}

function EducationBody({ education }: { education: Education }) {
  return (
    <div className="glass-entry">
      <div className="glass-entry-head">
        <h3 className="glass-entry-title">{education.school}</h3>
        <Meta when={education.when} where={education.where} />
      </div>
      <p className="glass-role">{education.degree}</p>
      <p className="glass-gpa">{education.gpa}</p>
      <ul className="glass-bullets">
        {education.honors.map((honor) => (
          <li key={honor}>{honor}</li>
        ))}
      </ul>
    </div>
  )
}

function SkillsBody({ groups }: { groups: SkillGroup[] }) {
  return (
    <div className="glass-groups">
      {groups.map((group) => (
        <div key={group.label}>
          <h3 className="glass-group-label">{group.label}</h3>
          <ul className="glass-chips">
            {group.items.map((item) => (
              <li key={item} className="glass-chip glass-inset">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function ContactBody({ links }: { links: ContactLink[] }) {
  return (
    <ul className="glass-contact">
      {links.map((link) => {
        const external = !link.href.startsWith('mailto:')
        return (
          <li key={link.href}>
            <a
              className="glass-contact-row"
              href={link.href}
              {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
            >
              <span className="glass-contact-label">{link.label}</span>
              <span className="glass-contact-value">{link.value}</span>
              <span className="glass-contact-arrow" aria-hidden="true">
                {external ? '↗' : '→'}
              </span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

/** One section's content, laid out for its kind. */
export function SectionBody({ section }: { section: ResumeSection }) {
  switch (section.kind) {
    case 'entries':
      return (
        <ol className="glass-entries">
          {section.entries.map((entry) => (
            <Entry key={entry.title} entry={entry} />
          ))}
        </ol>
      )
    case 'education':
      return <EducationBody education={section.education} />
    case 'skills':
      return <SkillsBody groups={section.groups} />
    case 'contact':
      return <ContactBody links={section.links} />
  }
}
