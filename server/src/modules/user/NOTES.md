# User profiles

## What this module does

Profile CRUD for the logged-in user: name, phone, avatar. Avatars go through a `StoragePort` so tests never call Cloudinary.

## Why it's built this way

Changing phone resets `isPhoneVerified` — otherwise a rider could swap to a number they do not own and skip OTP. Files are not stored on Render’s disk; Cloudinary (or the fake store) returns a URL we save on the user.

## What breaks without it

Riders cannot correct a typo in their name. A stolen session could not be distinguished from a real profile update in the audit log later, because there would be no canonical `UserService.updateProfile`.

## Interview version

The user service is the only writer of `User`. Admin suspend and rider profile edits both go through it, so status and uniqueness rules stay in one place.
