type PostcssConfig = {
  plugins: Record<string, unknown>;
};

const config: PostcssConfig = {
  plugins: {
    '@tailwindcss/postcss': {}
  }
};

export default config;
