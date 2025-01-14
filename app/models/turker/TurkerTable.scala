package models.turker

/**
  * Created by manaswi on 5/5/17.
  */

import models.utils.MyPostgresDriver.simple._
import models.amt.{AMTConditionTable,AMTCondition}
import play.api.Play.current
import scala.slick.lifted.ForeignKeyQuery

case class Turker(turkerId: String, routesAudited: String, amtConditionId: Int)
/**
  *
  */
class TurkerTable(tag: Tag) extends Table[Turker](tag, Some("sidewalk"), "turker") {
  def turkerId = column[String]("turker_id", O.NotNull, O.PrimaryKey)
  def routesAudited = column[String]("routes_audited", O.Nullable)
  def amtConditionId = column[Int]("amt_condition_id", O.NotNull)

  def * = (turkerId, routesAudited, amtConditionId) <> ((Turker.apply _).tupled, Turker.unapply)
  def condition: ForeignKeyQuery[AMTConditionTable, AMTCondition] =
    foreignKey("turker_amt_condition_id_fkey", amtConditionId, TableQuery[AMTConditionTable])(_.amtConditionId)

}

/**
  * Data access object for the Turker table
  */
object TurkerTable{
  val db = play.api.db.slick.DB
  val turkers = TableQuery[TurkerTable]

  val gtTurkerIds: List[String] = List("APQS1PRMDXAFH","A1SZNIADA6B4OF","A2G18P2LDT3ZUE")
  val researcherTurkerIds: List[String] =
    List("APQS1PRMDXAFH","A1SZNIADA6B4OF","A2G18P2LDT3ZUE","AKRNZU81S71QI","A1Y6PQWK6BYEDD","TESTWORKERID")

  def getAllTurkers : List[Turker] = db.withTransaction{ implicit session =>
    turkers.list
  }

  def getConditionIdByTurkerId(turkerId: String): Option[Int] = db.withTransaction { implicit session =>
    val turker = turkers.filter(_.turkerId === turkerId).list.headOption
    turker match {
      case Some(condition) => Some(condition.amtConditionId)
      case _ => None
    }
  }

  def save(turker: Turker): String = db.withTransaction { implicit session =>
    val turkerId: String =
      (turkers returning turkers.map(_.turkerId)) += turker
    turkerId
  }

  def updateConditionIdByTurkerId(turkerId: String, conditionId: Int) =  db.withTransaction { implicit session =>
    val q = for{ turker <- turkers if turker.turkerId === turkerId} yield turker.amtConditionId
    q.update(conditionId)
  }

}