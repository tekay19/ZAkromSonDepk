/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: 'tsconfig.json',
        }],
    },
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    transformIgnorePatterns: [
        '/node_modules/(?!(next-auth|@auth)/)'
    ],
    testPathIgnorePatterns: [
        '<rootDir>/tests/integration/',
    ],
};
