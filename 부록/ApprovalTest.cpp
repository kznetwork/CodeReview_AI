// ApprovalTest.cpp

#include <gtest/gtest.h>

#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "GildedRose.h"
#include "Item.h"

class ApprovalTest : public ::testing::Test {
protected:

    std::string printTextFixture(int days) {

        std::stringstream result;

        result << "OMGHAI!" << "\n";

        std::vector<Item> items = {
            Item("+5 Dexterity Vest", 10, 20),
            Item("Aged Brie", 2, 0),
            Item("Elixir of the Mongoose", 5, 7),
            Item("Sulfuras, Hand of Ragnaros", 0, 80),
            Item("Sulfuras, Hand of Ragnaros", -1, 80),
            Item("Backstage passes to a TAFKAL80ETC concert", 15, 20),
            Item("Backstage passes to a TAFKAL80ETC concert", 10, 49),
            Item("Backstage passes to a TAFKAL80ETC concert", 5, 49),
            Item("Conjured Mana Cake", 3, 6)
        };

        GildedRose app(items);

        for (int i = 0; i < days; ++i) {

            result << "-------- day "
                   << i
                   << " --------"
                   << "\n";

            result << "name, sellIn, quality"
                   << "\n";

            for (const auto& item : items) {

                result << item.toString()
                       << "\n";
            }

            result << "\n";

            app.updateQuality();
        }

        return result.str();
    }
};

// ─────────────────────────────────────────────
// Approval Test
// ─────────────────────────────────────────────

TEST_F(ApprovalTest, PrintTextFixture) {

    std::string actual =
        printTextFixture(2);

    std::string expected =
R"(OMGHAI!
-------- day 0 --------
name, sellIn, quality
+5 Dexterity Vest, 10, 20
Aged Brie, 2, 0
Elixir of the Mongoose, 5, 7
Sulfuras, Hand of Ragnaros, 0, 80
Sulfuras, Hand of Ragnaros, -1, 80
Backstage passes to a TAFKAL80ETC concert, 15, 20
Backstage passes to a TAFKAL80ETC concert, 10, 49
Backstage passes to a TAFKAL80ETC concert, 5, 49
Conjured Mana Cake, 3, 6

-------- day 1 --------
name, sellIn, quality
+5 Dexterity Vest, 9, 19
Aged Brie, 1, 1
Elixir of the Mongoose, 4, 6
Sulfuras, Hand of Ragnaros, 0, 80
Sulfuras, Hand of Ragnaros, -1, 80
Backstage passes to a TAFKAL80ETC concert, 14, 21
Backstage passes to a TAFKAL80ETC concert, 9, 50
Backstage passes to a TAFKAL80ETC concert, 4, 50
Conjured Mana Cake, 2, 4

)";

    EXPECT_EQ(expected, actual);
}