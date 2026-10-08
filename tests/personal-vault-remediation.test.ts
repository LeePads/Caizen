import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

import {
  completeLegacyVaultTaxonomyMigration,
  markLegacyVaultTaxonomyPending,
  prepareLegacyVaultTaxonomyMigration,
  readLegacyVaultTaxonomy,
} from "@/lib/personal-vault/legacy-taxonomy";
import {
  normalizePersonalVaultItems,
  normalizePersonalVaultTaxonomy,
} from "@/lib/personal-vault/normalization";
import { toLocalDateKey } from "@/lib/lifehub/date-utils";
import { prepareImport } from "@/lib/storage/import-integrity";
import {
  PERSONAL_VAULT_CATEGORY_OPTIONS,
  PERSONAL_VAULT_SECTION_OPTIONS,
  personalVaultCategoryLabel,
} from "@/lib/personal-vault/taxonomy";

const read = (path: string) => readFileSync(path, "utf8");

describe("Personal Vault targeted remediation", () => {
  beforeEach(() => localStorage.clear());

  it("preserves built-in labels for every Vault section and humanizes custom labels", () => {
    for (const { value: section } of PERSONAL_VAULT_SECTION_OPTIONS) {
      for (const option of PERSONAL_VAULT_CATEGORY_OPTIONS[section]) {
        expect(personalVaultCategoryLabel(section, option.id)).toBe(option.label);
      }
      expect(personalVaultCategoryLabel(section, "custom_category-name")).toBe("Custom Category Name");
    }
  });

  it.each(["", "unknown-legacy-type", "Documents", "constructor", "toString", "__proto__", null, undefined, 42, {}])(
    "safely falls back for an unknown section %j",
    section => {
      expect(personalVaultCategoryLabel(section, "identity-government")).toBe("Identity Government");
      expect(personalVaultCategoryLabel(section, "")).toBe("");
    },
  );

  it("normalizes malformed, legacy, unsafe, duplicate, and date-only records deterministically", () => {
    const now = new Date("2026-08-12T00:00:00.000Z");
    const input = [
      {
        id: "vault-duplicate",
        type: "government",
        title: "Passport",
        issued_at: "2026-08-12",
        url: "https://example.com/passport",
        image: "http://unsafe-preview.example/image.jpg",
        usernameHint: "private hint",
        favorite: "false",
      },
      {
        id: "vault-duplicate",
        type: "unknown-legacy-type",
        name: "Second reference",
        link: "javascript:alert(1)",
        date: "not-a-date",
      },
      null,
      "malformed row",
    ];

    const first = normalizePersonalVaultItems(input, now);
    const second = normalizePersonalVaultItems(first, now);

    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({
      id: "vault-duplicate",
      type: "document",
      subType: "identity-government",
      title: "Passport",
      link: "https://example.com/passport",
      image: undefined,
      referenceHint: "private hint",
      favorite: false,
    });
    expect(toLocalDateKey(first[0].date ?? undefined)).toBe("2026-08-12");
    expect(first[1].id).toBe("vault-duplicate~2");
    expect(first[1].type).toBe("document");
    expect(first[1].title).toBe("Second reference");
    expect(first[1].link).toBeUndefined();
    expect(first[1].date).toBeNull();
    expect(second).toEqual(first);
  });

  it("normalizes taxonomy duplicates without losing the first stable owner", () => {
    const taxonomy = normalizePersonalVaultTaxonomy([
      {
        id: "custom-documents",
        name: "Documents",
        subcategories: ["Tax", "tax"],
        customSubcategories: ["Tax"],
      },
      {
        id: "ignored-duplicate-id",
        name: " documents ",
        subcategories: ["Receipts"],
        archivedSubcategories: ["Receipts"],
      },
      null,
    ]);

    expect(taxonomy).toEqual([
      {
        id: "custom-documents",
        name: "Documents",
        archived: false,
        subcategories: ["Tax", "Receipts"],
        archivedSubcategories: ["Receipts"],
        customSubcategories: ["Tax"],
      },
    ]);
    expect(normalizePersonalVaultTaxonomy(taxonomy)).toEqual(taxonomy);
  });

  it("applies the Vault normalizer during import while retaining duplicate-ID blocking", () => {
    const prepared = prepareImport({
      format: "caizen-data",
      version: 3,
      data: {
        currentProfileId: "profile-a",
        profiles: [
          {
            id: "profile-a",
            personalVaultItems: [
              {
                id: "same-id",
                type: "legacy-government",
                title: "Imported reference",
                image: "javascript:alert(1)",
                date: "2026-08-12",
              },
              {
                id: "same-id",
                type: "links",
                title: "Duplicate reference",
              },
            ],
            personalVaultTaxonomy: [
              { name: "Documents", subcategories: ["Tax"] },
            ],
          },
        ],
      },
    });

    const imported = prepared.state.profiles[0].personalVaultItems;
    expect(imported[0]).toMatchObject({
      id: "same-id",
      type: "document",
      title: "Imported reference",
      image: undefined,
    });
    expect(prepared.report.duplicateIds).toContain(
      "profile-a:personalVaultItems:same-id",
    );
    expect(prepared.report.canImport).toBe(false);
  });

  it("assigns legacy taxonomy to one explicit profile owner and consumes it only after acknowledgement", () => {
    localStorage.setItem(
      "vault-tabs-document",
      JSON.stringify({ added: [{ id: "sensitive-tax" }], hidden: ["private"] }),
    );
    const legacy = readLegacyVaultTaxonomy();
    const ownerPlan = prepareLegacyVaultTaxonomyMigration(
      "profile-a",
      [],
      legacy,
    );

    expect(ownerPlan?.kind).toBe("apply");
    if (!ownerPlan || ownerPlan.kind !== "apply") throw new Error("missing owner plan");
    markLegacyVaultTaxonomyPending(ownerPlan.profileId, ownerPlan.signature);

    expect(
      prepareLegacyVaultTaxonomyMigration("profile-b", [], legacy),
    ).toBeNull();
    expect(
      prepareLegacyVaultTaxonomyMigration(
        "profile-a",
        ownerPlan.categories,
        legacy,
      ),
    ).toMatchObject({ kind: "complete", profileId: "profile-a" });

    completeLegacyVaultTaxonomyMigration(ownerPlan.profileId, ownerPlan.signature);
    expect(localStorage.getItem("vault-tabs-document")).toBeNull();
    expect(readLegacyVaultTaxonomy()).toEqual([]);
    expect(
      prepareLegacyVaultTaxonomyMigration("profile-a", [], readLegacyVaultTaxonomy()),
    ).toBeNull();
  });

  it("degrades malformed legacy taxonomy safely and retries a pending owner migration", () => {
    localStorage.setItem("vault-tabs-document", "not-json");
    expect(readLegacyVaultTaxonomy()).toEqual([]);

    localStorage.setItem(
      "vault-tabs-links",
      JSON.stringify({ added: [{ id: "one" }] }),
    );
    markLegacyVaultTaxonomyPending("profile-a", "previous-attempt");
    const legacy = readLegacyVaultTaxonomy();
    const retry = prepareLegacyVaultTaxonomyMigration("profile-a", [], legacy);

    expect(retry?.kind).toBe("apply");
    expect(localStorage.getItem("vault-tabs-links")).not.toBeNull();
  });

  it("keeps the Vault request, URL, persistence, and accessibility contracts explicit", () => {
    const section = read("components/sections/PersonalVaultSection.tsx");
    const modal = read("components/modals/PersonalVaultModal.tsx");
    const page = read("app/app/page.tsx");
    const context = read("lib/context.tsx");
    const profile = read("lib/profile/normalize-profile.ts");

    expect(section).toContain("requestedProfileId");
    expect(section).toContain("consumedRequestSignalRef");
    expect(section).toContain("onRequestedRecordConsumed");
    expect(section).toContain("aria-pressed={activeSection === type}");
    expect(section).toContain("selected={smartFilter === value}");
    expect(section).toContain("onSelectedChange={selected => { if (selected) setSmartFilter(value); }}");
    expect(section).toContain("onClick={openCategoryManager}");
    expect(section).toContain("normalizeExternalWebUrl(value)");
    expect(section).toContain("Add item");
    expect(section).toContain("Copy link");
    expect(section).toContain("More actions for");
    expect(section).toContain('if (smartFilter === "attention") return needsAttention(item);');
    expect(section).toContain("Open download page");
    expect(section).toContain("Missing link");
    expect(section).toContain("function displayDomain");
    expect(section).toContain("showTitleInPlanning: false");
    expect(section).toContain("showTitleInPlanning: normalized.showTitleInPlanning === true");
    expect(section).toMatch(/masked/i);
    expect(section).toMatch(/not encryption/i);
    expect(modal).toMatch(/Never store passwords or recovery codes/i);
    expect(modal).toContain("not encryption");
    expect(modal).toContain("<Field label={categoryLabel}");
    expect(modal).not.toContain('<Field label="Vault Type">');
    expect(modal).toContain('draft.type === "creative" || draft.type === "document" || Boolean(draft.image)');
    expect(modal).toContain('htmlFor="vault-notes"');
    expect(modal).toContain('id="vault-notes"');
    expect(modal).toMatch(/Software \/ resource name/i);
    expect(modal).toMatch(/Download \/ install link/i);
    expect(modal).toContain("A date is required before this title can appear");
    expect(modal).toContain("Show title in planning views");
    expect(modal).toContain("other Vault details stay private");
    expect(modal).not.toContain("password manager");
    expect(page).toContain("consumePersonalVaultFeatureRequest");
    expect(page).toContain("requestedProfileId={sectionFeatureRequest?.profileId}");
    expect(context).toContain("normalizePersonalVaultItems");
    expect(context).toContain("personalVaultItems: normalizePersonalVaultItems(");
    expect(context).toContain("...restored");
    expect(profile).toContain("normalizePersonalVaultTaxonomy");
    expect(profile).toContain("normalizePersonalVaultItems(profile?.personalVaultItems)");
  });

  it("keeps list cards compact and gives every grid card a consistent preview rail", () => {
    const section = read("components/sections/PersonalVaultSection.tsx");

    expect(section).toContain("role=\"toolbar\"");
    expect(section).toContain("aria-label=\"Vault filters and display controls\"");
    expect(section).toContain('label="Filter Vault items"');
    expect(section).toContain("aria-label=\"Vault retrieval controls\"");
    expect(section).toContain('label="Sort Vault items"');
    expect(section).toContain('label="Personal Vault view"');
    expect(section).toContain("const showThumbnail = !isList && (item.type === \"creative\" || item.type === \"document\");");
    expect(section).not.toContain("showGridVisual");
    expect(section).toContain('data-vault-thumbnail="list-icon"');
    expect(section).toContain("flex h-6 w-8 shrink-0 items-center justify-center");
    expect(section).not.toContain("h-14 w-14 rounded-xl border border-border/40 p-1.5 sm:h-16 sm:w-16");
    expect(section).toContain("object-contain");
    expect(section).toContain("aspect-[16/9] flex shrink-0 items-center justify-center overflow-hidden bg-muted/25 p-3");
    expect(section).toContain('aria-hidden="true"');
    expect(section).toContain("const [imageFailed, setImageFailed] = useState(false);");
    expect(section).toContain("onError={() => setImageFailed(true)}");
    expect(section).not.toContain("h-28 sm:h-auto sm:w-40");
    expect(section).toContain("aspect-[16/9]");
    expect(section).toContain('data-vault-thumbnail="grid"');
  });
});
