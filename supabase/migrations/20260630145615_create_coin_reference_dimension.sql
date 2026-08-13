CREATE TYPE coin_strike_type AS ENUM ('Business','Proof','Reverse Proof','Specimen','Pattern');

CREATE TABLE coin_types (
  type_id text PRIMARY KEY,
  category text NOT NULL,
  subcategory text,
  coin_name text NOT NULL,
  denomination text,
  face_value numeric(12,3),
  metal text,
  years_issued text,
  status text,
  designer text,
  diameter_mm text,
  pcgs_number text,
  ngc_number text,
  red_book_ref text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coin_types_category ON coin_types (category);
CREATE INDEX idx_coin_types_denomination ON coin_types (denomination);

CREATE TABLE coin_mintages (
  issue_id text PRIMARY KEY,
  type_id text NOT NULL REFERENCES coin_types (type_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  year integer NOT NULL,
  mintmark text,
  mint text NOT NULL,
  strike_type coin_strike_type NOT NULL DEFAULT 'Business',
  variety text,
  mintage bigint,
  source text NOT NULL,
  source_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coin_mintages_type ON coin_mintages (type_id);
CREATE INDEX idx_coin_mintages_year ON coin_mintages (year);
CREATE INDEX idx_coin_mintages_strike ON coin_mintages (strike_type);

CREATE VIEW v_coin_business_mintages AS
SELECT t.coin_name, t.denomination, m.year, m.mint, m.mintmark, m.variety, m.mintage, m.notes
FROM coin_mintages m
JOIN coin_types t USING (type_id)
WHERE m.strike_type = 'Business'
ORDER BY t.coin_name, m.year, m.mint;