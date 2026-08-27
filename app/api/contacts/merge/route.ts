export const dynamic = 'force-dynamic';
import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';

// POST — merge two contacts into one
// keepId = the contact to keep, mergeId = the contact to absorb & delete
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { keepId, mergeId } = await req.json();

    if (!keepId || !mergeId || keepId === mergeId) {
      return NextResponse.json({ error: 'keepId and mergeId required and must differ' }, { status: 400 });
    }

    const [keepContact, mergeContact] = await Promise.all([
      prisma.contact.findFirst({ where: { id: keepId, userId }, include: { notes: true } }),
      prisma.contact.findFirst({ where: { id: mergeId, userId }, include: { notes: true } }),
    ]);

    if (!keepContact || !mergeContact) {
      return NextResponse.json({ error: 'One or both contacts not found' }, { status: 404 });
    }

    // Merge data: keep primary's data, fill gaps from merge contact
    const updateData: any = {};

    // Fill empty fields from merge contact
    const fillFields = ['email', 'phone', 'company', 'role', 'avatar', 'birthday', 'howWeMet', 'familyNotes'] as const;
    for (const f of fillFields) {
      if (!keepContact[f] && mergeContact[f]) {
        updateData[f] = mergeContact[f];
      }
    }

    // Merge interests arrays
    const keepInterests = Array.isArray(keepContact.interests) ? keepContact.interests as string[] : [];
    const mergeInterests = Array.isArray(mergeContact.interests) ? mergeContact.interests as string[] : [];
    if (mergeInterests.length > 0) {
      updateData.interests = [...new Set([...keepInterests, ...mergeInterests])];
    }

    // Merge aliases: combine existing aliases + merge contact's name, nickname, aliases
    const keepAliases = Array.isArray(keepContact.aliases) ? keepContact.aliases as string[] : [];
    const mergeAliases = Array.isArray(mergeContact.aliases) ? mergeContact.aliases as string[] : [];
    const newAliases = [...keepAliases, ...mergeAliases];
    // Add merge contact's name and nickname as aliases
    if (mergeContact.name && mergeContact.name.toLowerCase() !== keepContact.name.toLowerCase()) {
      newAliases.push(mergeContact.name);
    }
    if (mergeContact.nickname && mergeContact.nickname.toLowerCase() !== (keepContact.nickname || '').toLowerCase()) {
      newAliases.push(mergeContact.nickname);
    }
    if (keepContact.nickname) newAliases.push(keepContact.nickname);
    // Deduplicate (case-insensitive)
    const seen = new Set<string>();
    const dedupedAliases = newAliases.filter(a => {
      if (!a) return false;
      const lower = a.toLowerCase();
      // Don't include if it's the same as the kept name
      if (lower === keepContact.name.toLowerCase()) return false;
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
    if (dedupedAliases.length > 0) updateData.aliases = dedupedAliases;

    // Merge social links
    const keepSocial = (keepContact.socialLinks as Record<string, string>) || {};
    const mergeSocial = (mergeContact.socialLinks as Record<string, string>) || {};
    const mergedSocial = { ...mergeSocial, ...keepSocial }; // keep's values take priority
    if (Object.keys(mergedSocial).length > 0) updateData.socialLinks = mergedSocial;

    // Use the more recent lastContactedAt
    if (mergeContact.lastContactedAt && (!keepContact.lastContactedAt || mergeContact.lastContactedAt > keepContact.lastContactedAt)) {
      updateData.lastContactedAt = mergeContact.lastContactedAt;
    }

    // Favorite: keep if either is favorite
    if (mergeContact.isFavorite && !keepContact.isFavorite) {
      updateData.isFavorite = true;
    }

    // Move all notes from merge contact to keep contact
    await prisma.contactNote.updateMany({
      where: { contactId: mergeId },
      data: { contactId: keepId },
    });

    // Update journal entry mentionedContactIds that reference mergeId
    const journalEntries = await prisma.journalEntry.findMany({
      where: { userId, NOT: { mentionedContactIds: { equals: Prisma.DbNull } } },
    });
    for (const je of journalEntries) {
      const ids = je.mentionedContactIds as string[] | null;
      if (ids && ids.includes(mergeId)) {
        const updatedIds = ids.map(id => id === mergeId ? keepId : id);
        await prisma.journalEntry.update({
          where: { id: je.id },
          data: { mentionedContactIds: [...new Set(updatedIds)] as any },
        });
      }
    }

    // Update the kept contact
    const result = await prisma.contact.update({
      where: { id: keepId },
      data: updateData,
      include: { group: true, notes: { orderBy: { date: 'desc' } } },
    });

    // Delete the merged contact
    await prisma.contact.delete({ where: { id: mergeId } });

    return NextResponse.json({
      success: true,
      contact: result,
      mergedName: mergeContact.name,
    });
  } catch (e: any) { return handleApiError(e); }
}
