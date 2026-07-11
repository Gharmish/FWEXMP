import type { getTranslations } from 'next-intl/server';
import type { ExperienceFormCopy } from '@/app/[locale]/host/(dashboard)/experiences/[id]/experience-form';
import { BOOKING_CUTOFF_OPTIONS } from '@/features/host-experiences/schemas';

/**
 * Build the form's `copy` payload from the `hostExperiences.form`
 * translation namespace. Centralised so the create and edit pages
 * can't drift in which keys they pass through — every form field's
 * label lives here exactly once.
 *
 * `t` must be scoped to `hostExperiences.form` already (the caller
 * does `await getTranslations('hostExperiences.form')`).
 */
type Translator = Awaited<ReturnType<typeof getTranslations>>;

export function buildExperienceFormCopy(t: Translator): ExperienceFormCopy {
  return {
    sectionBasics: t('sectionBasics'),
    sectionPracticalities: t('sectionPracticalities'),
    sectionPlace: t('sectionPlace'),
    sectionDetail: t('sectionDetail'),
    sectionAvailability: t('sectionAvailability'),
    titleLabel: t('titleLabel'),
    titleHint: t('titleHint'),
    descriptionLabel: t('descriptionLabel'),
    descriptionHint: t('descriptionHint'),
    categoryLabel: t('categoryLabel'),
    durationLabel: t('durationLabel'),
    priceLabel: t('priceLabel'),
    groupSizeLabel: t('groupSizeLabel'),
    minAgeLabel: t('minAgeLabel'),
    placeNameLabel: t('placeNameLabel'),
    placeNameHint: t('placeNameHint'),
    startTimeLabel: t('startTimeLabel'),
    startTimeHint: t('startTimeHint'),
    bookingCutoffLabel: t('bookingCutoffLabel'),
    bookingCutoffHint: t('bookingCutoffHint'),
    bookingCutoffOptions: BOOKING_CUTOFF_OPTIONS.map((hours) => ({
      value: hours,
      label: t('bookingCutoffOption', { hours }),
    })),
    latLabel: t('latLabel'),
    lngLabel: t('lngLabel'),
    coordsHint: t('coordsHint'),
    coordsPasteLabel: t('coordsPasteLabel'),
    coordsPastePlaceholder: t('coordsPastePlaceholder'),
    coordsPasteInvalid: t('coordsPasteInvalid'),
    coordsPreviewTitle: t('coordsPreviewTitle'),
    mapSearchLabel: t('mapSearchLabel'),
    mapSearchPlaceholder: t('mapSearchPlaceholder'),
    mapSearchButton: t('mapSearchButton'),
    mapSearchNotFound: t('mapSearchNotFound'),
    mapHint: t('mapHint'),
    manualCoordsLabel: t('manualCoordsLabel'),
    cityLabel: t('cityLabel'),
    regionLabel: t('regionLabel'),
    inclusionsLabel: t('inclusionsLabel'),
    inclusionsPlaceholder: t('inclusionsPlaceholder'),
    inclusionsHint: t('inclusionsHint'),
    whatToBringLabel: t('whatToBringLabel'),
    whatToBringPlaceholder: t('whatToBringPlaceholder'),
    whatToBringHint: t('whatToBringHint'),
    cancellationLabel: t('cancellationLabel'),
    cancellationPlaceholder: t('cancellationPlaceholder'),
    weekdaysLabel: t('weekdaysLabel'),
    weekdaysHint: t('weekdaysHint'),
    weekdays: [
      t('weekdays.sun'),
      t('weekdays.mon'),
      t('weekdays.tue'),
      t('weekdays.wed'),
      t('weekdays.thu'),
      t('weekdays.fri'),
      t('weekdays.sat'),
    ] as const,
    categories: {
      nature: t('categories.nature'),
      heritage: t('categories.heritage'),
      food: t('categories.food'),
      wellness: t('categories.wellness'),
      adventure: t('categories.adventure'),
      family: t('categories.family'),
      women_only: t('categories.women_only'),
    },
    submitCreate: t('submitCreate'),
    submitCreatePending: t('submitCreatePending'),
    submitEdit: t('submitEdit'),
    submitEditPending: t('submitEditPending'),
    errors: {
      validation: t('errors.validation'),
      server: t('errors.server'),
      forbidden: t('errors.forbidden'),
      notFound: t('errors.notFound'),
      noDb: t('errors.noDb'),
      cannotPublish: t('errors.cannotPublish'),
      fields: {
        titleShort: t('errors.fields.titleShort'),
        titleLong: t('errors.fields.titleLong'),
        descriptionShort: t('errors.fields.descriptionShort'),
        descriptionLong: t('errors.fields.descriptionLong'),
        durationShort: t('errors.fields.durationShort'),
        durationLong: t('errors.fields.durationLong'),
        priceNegative: t('errors.fields.priceNegative'),
        priceTooHigh: t('errors.fields.priceTooHigh'),
        policyShort: t('errors.fields.policyShort'),
        policyLong: t('errors.fields.policyLong'),
        timeInvalid: t('errors.fields.timeInvalid'),
        coordsInvalid: t('errors.fields.coordsInvalid'),
        groupInvalid: t('errors.fields.groupInvalid'),
        ageInvalid: t('errors.fields.ageInvalid'),
        required: t('errors.fields.required'),
      },
    },
  };
}
