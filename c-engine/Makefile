CC ?= gcc
CFLAGS = -Wall -Wextra -pthread -O2 -g -Isrc
LDFLAGS = -pthread

SRC = src/main.c src/events.c src/synchronization.c src/philosopher.c
BIN = bin/simulation_engine

TEST_SRC = tests/test_synchronization.c src/events.c src/synchronization.c src/philosopher.c
TEST_BIN = bin/test_synchronization

all: $(BIN)

$(BIN): $(SRC)
	@mkdir -p bin
	$(CC) $(CFLAGS) -o $@ $(SRC) $(LDFLAGS)

test: $(TEST_BIN)
	@mkdir -p bin
	./$(TEST_BIN)

$(TEST_BIN): $(TEST_SRC)
	@mkdir -p bin
	$(CC) $(CFLAGS) -o $@ $(TEST_SRC) $(LDFLAGS)

clean:
	rm -rf bin/simulation_engine bin/test_synchronization *.o

.PHONY: all test clean
