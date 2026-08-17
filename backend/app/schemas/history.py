from sqlmodel import SQLModel


class ChampionTeam(SQLModel):
    abbr: str
    name: str
    nickname: str
    color: str


class ChampionRow(SQLModel):
    season: int
    team: ChampionTeam
    result: str


class TitleCountTeam(SQLModel):
    abbr: str
    nickname: str
    color: str


class TitleCount(SQLModel):
    team: TitleCountTeam
    count: int


class DynastyTeam(SQLModel):
    abbr: str
    color: str


class DynastyRow(SQLModel):
    team: DynastyTeam
    label: str
    titles: int
    note: str


class HistoryResponse(SQLModel):
    champions: list[ChampionRow]
    most_titles: list[TitleCount]
    dynasties: list[DynastyRow]
