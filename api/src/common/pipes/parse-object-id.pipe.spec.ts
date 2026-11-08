import { BadRequestException } from '@nestjs/common';
import { ParseObjectIdPipe } from './parse-object-id.pipe';

describe('ParseObjectIdPipe', () => {
  const pipe = new ParseObjectIdPipe();

  it('returns a valid 24-hex id unchanged', () => {
    expect(pipe.transform('507f1f77bcf86cd799439011')).toBe(
      '507f1f77bcf86cd799439011',
    );
  });

  it.each(['abc', '', '123456789012'])('rejects %p', (value) => {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });
});
