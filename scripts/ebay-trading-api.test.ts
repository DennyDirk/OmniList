import { test } from "node:test";
import assert from "node:assert/strict";
import { parseActiveListings } from "../apps/api/src/modules/channels/adapters/ebay-active-listings";

test("parseActiveListings parses valid Trading API response", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <ActiveList>
    <PaginationResult>
      <TotalNumberOfEntries>50</TotalNumberOfEntries>
      <TotalNumberOfPages>1</TotalNumberOfPages>
    </PaginationResult>
    <ItemArray>
      <Item>
        <ItemID>123456789</ItemID>
        <Title>Test Item 1</Title>
        <SKU>SKU-001</SKU>
        <ListingType>FixedPrice</ListingType>
        <QuantityAvailable>5</QuantityAvailable>
        <SellingStatus>
          <CurrentPrice currencyID="USD">19.99</CurrentPrice>
        </SellingStatus>
      </Item>
      <Item>
        <ItemID>987654321</ItemID>
        <Title>Test Item 2</Title>
        <ListingType>FixedPrice</ListingType>
        <QuantityAvailable>3</QuantityAvailable>
      </Item>
    </ItemArray>
  </ActiveList>
</GetMyeBaySellingResponse>`;

  const result = parseActiveListings(xml, 1);
  assert.equal(result.page, 1);
  assert.equal(result.total, 50);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].listingId, "123456789");
  assert.equal(result.items[0].title, "Test Item 1");
  assert.equal(result.items[0].sku, "SKU-001");
  assert.equal(result.items[0].quantity, 5);
  assert.equal(result.items[0].price?.value, "19.99");
  assert.equal(result.items[1].sku, undefined); // SKU optional
  assert.equal(result.nextPage, null); // Only 1 page total
});

test("parseActiveListings handles empty ItemArray", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <ActiveList>
    <PaginationResult>
      <TotalNumberOfEntries>0</TotalNumberOfEntries>
      <TotalNumberOfPages>0</TotalNumberOfPages>
    </PaginationResult>
    <ItemArray></ItemArray>
  </ActiveList>
</GetMyeBaySellingResponse>`;

  const result = parseActiveListings(xml, 1);
  assert.equal(result.total, 0);
  assert.equal(result.items.length, 0);
  assert.equal(result.nextPage, null);
});

test("parseActiveListings rejects XXE entity injection attempts", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<GetMyeBaySellingResponse>&xxe;</GetMyeBaySellingResponse>`;

  assert.throws(
    () => parseActiveListings(xml, 1),
    /Could not read active eBay listings/
  );
});

test("parseActiveListings handles pagination correctly", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <ActiveList>
    <PaginationResult>
      <TotalNumberOfEntries>500</TotalNumberOfEntries>
      <TotalNumberOfPages>3</TotalNumberOfPages>
    </PaginationResult>
    <ItemArray>
      <Item>
        <ItemID>123</ItemID>
        <Title>Item</Title>
        <ListingType>FixedPrice</ListingType>
      </Item>
    </ItemArray>
  </ActiveList>
</GetMyeBaySellingResponse>`;

  const result = parseActiveListings(xml, 1);
  assert.equal(result.page, 1);
  assert.equal(result.total, 500);
  assert.equal(result.nextPage, 2); // More pages exist
});

test("parseActiveListings rejects API error responses", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Failure</Ack>
  <Errors>
    <Error>
      <SeverityCode>Error</SeverityCode>
      <ErrorCode>1000</ErrorCode>
    </Error>
  </Errors>
</GetMyeBaySellingResponse>`;

  assert.throws(
    () => parseActiveListings(xml, 1),
    /Could not read active eBay listings/
  );
});
