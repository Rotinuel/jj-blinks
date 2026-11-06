import Image from 'next/image';
import { requirePermission } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { removeContentImageAction, saveAnnouncementAction, saveHomeAction, savePagesAction } from '@/app/actions/admin/store';
import SingleImageUpload from '@/components/admin/SingleImageUpload';
import SubmitButton from '@/components/admin/SubmitButton';
import { Field, Flash, PageHead } from '@/components/admin/ui';

export const metadata = { title: 'Homepage & pages' };

function Slot({ slot, label, data }) {
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-24 w-20 shrink-0 bg-ivory-deep">{data.image_url && <Image src={data.image_url} alt="" fill sizes="5rem" className="object-cover" />}</div>
      <div className="space-y-1 text-sm">
        <p className="font-medium">{label}</p>
        <SingleImageUpload fields={{ purpose: 'content', slot }} hasImage={Boolean(data.image_url)} />
        {data.image_url && <form action={removeContentImageAction}><input type="hidden" name="slot" value={slot} /><button className="text-danger underline">Remove</button></form>}
      </div>
    </div>
  );
}

export default async function ContentAdmin({ searchParams }) {
  await requirePermission('content.manage');
  const [sp, settings] = await Promise.all([searchParams, getSettings()]);
  const h = settings.home;
  const occ = [...(h.occasions || []), ...Array(6).fill({})].slice(0, 6);
  const faqs = [...(settings.pages.faqs || []), ...Array(12).fill({})].slice(0, Math.max(4, (settings.pages.faqs || []).length + 2));
  return (
    <>
      <PageHead title="Homepage & pages" />
      <Flash sp={sp} />
      <section className="mb-12 max-w-3xl"><h2 className="mb-4 font-display text-2xl">Announcement bar</h2>
        <form action={saveAnnouncementAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Text" name="text" defaultValue={settings.announcement.text} maxLength={160} className="sm:col-span-2" />
          <Field label="Link (optional)" name="link" defaultValue={settings.announcement.link} hint="/custom-orders or https://…" />
          <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" name="enabled" defaultChecked={settings.announcement.enabled} /> Show</label>
          <SubmitButton className="btn btn-primary btn-sm justify-self-start">Save</SubmitButton>
        </form>
      </section>

      <section className="mb-12"><h2 className="mb-4 font-display text-2xl">Homepage images</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Slot slot="hero" label="Campaign hero (portrait)" data={h.hero} />
          <Slot slot="custom_feature" label="Custom orders" data={h.custom_feature} />
          <Slot slot="apparel" label="Branded apparel (landscape)" data={h.apparel} />
          <Slot slot="story" label="Brand story (portrait)" data={h.story} />
        </div>
        <p className="mt-3 text-xs text-muted">Collection images are set under Collections.</p>
      </section>

      <form action={saveHomeAction} className="mb-12 grid max-w-4xl gap-8">
        <h2 className="font-display text-2xl">Homepage text</h2>
        <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-2 font-medium">Hero</legend>
          <Field label="Small line above the headline (optional)" name="hero_eyebrow" defaultValue={h.hero.eyebrow} />
          <Field label="Headline" name="hero_headline" defaultValue={h.hero.headline} />
          <Field label="Introduction" name="hero_subheading" type="textarea" defaultValue={h.hero.subheading} className="sm:col-span-2" />
          <Field label="Hero image description" name="hero_image_alt" defaultValue={h.hero.image_alt} />
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-2 font-medium">Custom orders feature</legend>
          <Field label="Heading" name="custom_heading" defaultValue={h.custom_feature.heading} />
          <Field label="Image description" name="custom_image_alt" defaultValue={h.custom_feature.image_alt} />
          <Field label="Text" name="custom_text" type="textarea" defaultValue={h.custom_feature.text} className="sm:col-span-2" />
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-2 font-medium">Branded apparel & corporate</legend>
          <Field label="Heading" name="apparel_heading" defaultValue={h.apparel.heading} />
          <Field label="Image description" name="apparel_image_alt" defaultValue={h.apparel.image_alt} />
          <Field label="Text" name="apparel_text" type="textarea" defaultValue={h.apparel.text} className="sm:col-span-2" />
        </fieldset>
        <fieldset className="grid gap-4"><legend className="mb-2 font-medium">Occasions (up to 6)</legend>
          {occ.map((o, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-3">
              <input name={`occ_title_${i}`} defaultValue={o.title || ''} placeholder="Title" className="input" aria-label={`Occasion ${i + 1} title`} />
              <input name={`occ_text_${i}`} defaultValue={o.text || ''} placeholder="Short text" className="input" aria-label={`Occasion ${i + 1} text`} />
              <input name={`occ_href_${i}`} defaultValue={o.href || ''} placeholder="/collections/…" className="input" aria-label={`Occasion ${i + 1} link`} />
            </div>
          ))}
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-2 font-medium">Brand story</legend>
          <Field label="Heading" name="story_heading" defaultValue={h.story.heading} />
          <Field label="Image description" name="story_image_alt" defaultValue={h.story.image_alt} />
          <Field label="Story (blank line between paragraphs)" name="story_body" type="textarea" defaultValue={h.story.body} rows={8} className="sm:col-span-2" hint="Write only what is true about the business." />
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-2 font-medium">Newsletter</legend>
          <Field label="Heading" name="nl_heading" defaultValue={h.newsletter.heading} />
          <Field label="Text" name="nl_text" defaultValue={h.newsletter.text} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="nl_enabled" defaultChecked={h.newsletter.enabled} /> Show newsletter sign-up</label>
        </fieldset>
        <SubmitButton className="btn btn-primary justify-self-start">Save homepage</SubmitButton>
      </form>

      <form action={savePagesAction} className="grid max-w-4xl gap-6">
        <h2 className="font-display text-2xl">Pages</h2>
        <Field label="About page (blank = use the brand story)" name="about" type="textarea" defaultValue={settings.pages.about} rows={8} />
        <Field label="Returns policy" name="returns" type="textarea" defaultValue={settings.pages.returns} rows={8} />
        <fieldset className="grid gap-3"><legend className="mb-2 font-medium">Your FAQs (shown before the standard ones)</legend>
          {faqs.map((f, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr]">
              <input name={`faq_q_${i}`} defaultValue={f.q || ''} placeholder="Question" className="input" aria-label={`FAQ ${i + 1} question`} />
              <input name={`faq_a_${i}`} defaultValue={f.a || ''} placeholder="Answer" className="input" aria-label={`FAQ ${i + 1} answer`} />
            </div>
          ))}
        </fieldset>
        <SubmitButton className="btn btn-primary justify-self-start">Save pages</SubmitButton>
      </form>
    </>
  );
}
