/*
  # Certificate designs

  `courses.certificate_design`: which certificate template the course uses.
  The certificate image is drawn in the Mini App from the issued record, so a
  new choice applies to every certificate of the course, including ones issued
  before. What makes a certificate genuine is still its verification code.

  Safe to run more than once.
*/

ALTER TABLE courses ADD COLUMN IF NOT EXISTS certificate_design text NOT NULL DEFAULT 'classic';

ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_certificate_design_check;
ALTER TABLE courses ADD CONSTRAINT courses_certificate_design_check
  CHECK (certificate_design IN ('classic', 'royal', 'modern', 'minimal'));
