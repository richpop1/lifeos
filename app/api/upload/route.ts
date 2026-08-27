export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/user';
import { handleApiError } from '@/lib/api-utils';
import { generatePresignedUploadUrl, getFileUrl } from '@/lib/s3';

// POST — get a presigned upload URL
export async function POST(req: Request) {
  try {
    await requireUserId();
    const { fileName, contentType, isPublic } = await req.json();

    if (!fileName || !contentType) {
      return NextResponse.json({ error: 'fileName and contentType required' }, { status: 400 });
    }

    // Validate file type — only images and videos
    if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
      return NextResponse.json({ error: 'Only image and video files are allowed' }, { status: 400 });
    }

    // Max 50MB
    const { uploadUrl, cloud_storage_path } = await generatePresignedUploadUrl(
      fileName,
      contentType,
      isPublic ?? true // journal media is public by default for easy rendering
    );

    // Get the public URL for after upload
    const publicUrl = await getFileUrl(cloud_storage_path, contentType, isPublic ?? true);

    return NextResponse.json({ uploadUrl, cloud_storage_path, publicUrl });
  } catch (error) {
    return handleApiError(error);
  }
}
