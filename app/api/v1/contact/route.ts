/**
 * POST /v1/contact verifies a selected prospect's email through Apollo.
 */

import { z } from "zod";
import { getVerifiedContactEmail } from "@/lib/apollo";
import { cachePerson, resolvePerson } from "@/lib/people-cache";
import { badRequest, guard, json } from "@/lib/http";
import type { ProspectPerson } from "@/lib/types";

const EmailStatusSchema = z.enum(["verified", "guessed", "unavailable"]);
const EmailSourceSchema = z.enum(["fiber", "apollo"]);

const ProspectPersonSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  title: z.string(),
  company: z.string(),
  companyId: z.string(),
  location: z.string().optional(),
  email: z.string().optional(),
  emailStatus: EmailStatusSchema.optional(),
  emailSource: EmailSourceSchema.optional(),
  linkedinUrl: z.string().optional(),
  xUrl: z.string().optional(),
  evidence: z.string(),
  matchScore: z.number(),
  channels: z.object({
    email: z.boolean(),
    linkedin: z.boolean(),
    x: z.boolean(),
  }),
});

const ContactRequestSchema = z.object({
  person: ProspectPersonSchema,
});

interface ContactResponse {
  person: ProspectPerson;
  notes: string[];
}

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "icloud.com",
  "me.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
]);

export async function POST(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("invalid JSON body");
  }

  const parsed = ContactRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
  }

  const person = withCachedIdentifiers(parsed.data.person);
  const emailResult = await getVerifiedContactEmail({
    name: person.name,
    company: person.company,
    domain: getCompanyDomainHint(person.email),
    linkedinUrl: person.linkedinUrl,
  });
  const enrichedPerson = applyApolloEmail(person, emailResult);

  cachePerson({
    id: enrichedPerson.id,
    name: enrichedPerson.name,
    title: enrichedPerson.title,
    company: enrichedPerson.company,
    location: enrichedPerson.location,
    email: enrichedPerson.email,
    linkedinUrl: enrichedPerson.linkedinUrl,
    xUrl: enrichedPerson.xUrl,
  });

  const response: ContactResponse = {
    person: enrichedPerson,
    notes: emailResult.reason ? [emailResult.reason] : [],
  };

  return json(response);
}

function withCachedIdentifiers(person: ProspectPerson): ProspectPerson {
  const cached = resolvePerson(person.id);
  if (!cached) return person;

  return {
    ...person,
    name: cached.name || person.name,
    title: cached.title ?? person.title,
    company: cached.company ?? person.company,
    location: cached.location ?? person.location,
    linkedinUrl: cached.linkedinUrl ?? person.linkedinUrl,
    xUrl: cached.xUrl ?? person.xUrl,
  };
}

function applyApolloEmail(
  person: ProspectPerson,
  emailResult: Awaited<ReturnType<typeof getVerifiedContactEmail>>,
): ProspectPerson {
  if (emailResult.available && emailResult.email) {
    return {
      ...person,
      email: emailResult.email,
      emailStatus: emailResult.emailStatus,
      emailSource: "apollo",
      channels: { ...person.channels, email: true },
    };
  }

  return {
    ...person,
    email: undefined,
    emailStatus: "unavailable",
    emailSource: "apollo",
    channels: { ...person.channels, email: false },
  };
}

function getCompanyDomainHint(email?: string): string | undefined {
  const domain = email?.split("@")[1]?.trim().toLowerCase();
  if (!domain || GENERIC_EMAIL_DOMAINS.has(domain)) return undefined;
  return domain;
}
